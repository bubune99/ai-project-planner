/**
 * Upkeep tools (card c28cb7e1 parts 4 and 5): checks a platform agent, or any agent, runs over the planner's own
 * data. They move nothing by themselves; what needs the owner becomes one question per project in his inbox.
 *
 *   upkeep_stale_check   cards in progress that have not moved, open twins with the same title, carried-over cards
 *                        nobody has reviewed. Rules in lib/upkeep/stale-check.ts (pure, asserted).
 *   upkeep_runs          what each earlier run checked, found and asked, so its usefulness can be counted.
 *
 * Every run is recorded in upkeep_runs (migration 081). Each tool is classified in lib/agents/risk.ts.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpScope } from "@/lib/auth/mcp-context"
import { buildQuestionInput } from "@/lib/inbox"
import { notifyOwner } from "@/lib/notify/owner"
import { findStale, questionFor, summarize, IDLE_DAYS, UNREVIEWED_DAYS, type StepRow } from "@/lib/upkeep/stale-check"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerUpkeepTools(server: any): void {
  server.tool(
    "upkeep_stale_check",
    `The stale-task check over your projects: cards in progress that have not moved in ${IDLE_DAYS} days (an agent puts these back to Up next with a note; never a question), open cards with the same title in one project (the owner's to merge: with ask=true, one question per project in his inbox, never twice while one is open), and cards carried over from the old todo list, ${UNREVIEWED_DAYS}+ days old, that nobody has written on (counted, for an agent to sort). Moves nothing. Every run is recorded (upkeep_runs).`,
    {
      projectId: z.string().optional().describe("Only this project"),
      ask: z.boolean().optional().describe("Put what is the owner's to decide into his inbox (default false: report only)"),
      by: z.string().max(120).optional().describe("Your agent name, kept on the run record"),
    },
    async ({ projectId, ask, by }: { projectId?: string; ask?: boolean; by?: string }) => {
      try {
        const userId = getMcpUserId()
        if (projectId && !UUID.test(projectId)) return fail("projectId must be a project id")
        if (ask) requireMcpScope("write")
        // Only the caller's own projects: a question goes to the caller's own inbox.
        const rows = (await sql`
          SELECT s.id, s.project_id, p.name AS project, s.title, s.status, s.updated_at, s.created_at,
                 (s.source_todo_id IS NOT NULL) AS from_todo,
                 EXISTS (SELECT 1 FROM step_comments c WHERE c.step_id = s.id) AS commented,
                 COALESCE(ps.kind, CASE s.status WHEN 'in-progress' THEN 'active' WHEN 'completed' THEN 'done'
                                                 WHEN 'blocked' THEN 'closed' WHEN 'failed' THEN 'closed' ELSE 'open' END) AS kind
            FROM project_steps s
            JOIN projects p ON p.id = s.project_id AND p.deleted_at IS NULL AND p.user_id = ${userId}
            LEFT JOIN project_statuses ps ON ps.project_id = s.project_id AND ps.key = s.status AND ps.deleted_at IS NULL
           WHERE s.deleted_at IS NULL
             AND (${projectId ?? null}::uuid IS NULL OR s.project_id = ${projectId ?? null}::uuid)
        `) as Record<string, unknown>[]
        const steps: StepRow[] = rows.map((r) => ({
          id: String(r.id), projectId: String(r.project_id), project: String(r.project), title: String(r.title ?? ""),
          status: String(r.status), statusKind: r.kind as StepRow["statusKind"],
          updatedAt: new Date((r.updated_at ?? r.created_at) as string).toISOString(),
          createdAt: new Date(r.created_at as string).toISOString(), fromTodo: Boolean(r.from_todo), commented: Boolean(r.commented),
        }))
        const findings = findStale(steps, Date.now())
        const counts = summarize(findings)

        const asked: string[] = []
        const skipped: string[] = []
        if (ask) {
          const projects = [...new Set(findings.filter((f) => f.kind === "duplicate").map((f) => f.projectId))]
          for (const pid of projects) {
            const q = questionFor(findings, pid)
            if (!q) continue
            const [already] = (await sql`
              SELECT id FROM agent_jobs
               WHERE created_by = ${userId} AND status = 'awaiting-unlock' AND 'upkeep' = ANY(tags)
                 AND input->>'projectId' = ${pid}
               LIMIT 1
            `) as { id: string }[]
            if (already) { skipped.push(already.id); continue }
            const built = buildQuestionInput({ question: q.question, options: q.options, context: q.context, projectId: pid })
            if (!built.ok) return fail(built.error)
            const [job] = (await sql`
              INSERT INTO agent_jobs (title, description, created_by, assigned_to, status, priority, input, tags, unlock_prompt, metadata)
              VALUES (${built.value.question.slice(0, 255)}, ${built.value.input.context}, ${userId}, ${by ?? "upkeep"},
                      'awaiting-unlock', 'normal', ${JSON.stringify(built.value.input)}::jsonb, ARRAY['question', 'upkeep'],
                      ${built.value.question}, ${JSON.stringify({ askedFrom: "upkeep_stale_check" })}::jsonb)
              RETURNING id
            `) as { id: string }[]
            asked.push(job.id)
            await notifyOwner(userId, "question", { id: job.id, text: built.value.question, projectId: pid })
          }
        }

        const [run] = (await sql`
          INSERT INTO upkeep_runs (kind, user_id, project_id, ran_by, checked, found, asked)
          VALUES ('stale_check', ${userId}, ${projectId ?? null}, ${by ?? "agent"}, ${steps.length},
                  ${JSON.stringify({ ...counts, findings: findings.slice(0, 200) })}::jsonb, ${asked}::uuid[])
          RETURNING id
        `) as { id: string }[]

        const idle = findings.filter((f) => f.kind === "idle")
        return ok({
          runId: run.id,
          checked: steps.length,
          ...counts,
          idleCards: idle.slice(0, 50).map((f) => ({ taskId: f.stepIds[0], title: f.titles[0], project: f.project, daysStill: f.days })),
          duplicates: findings.filter((f) => f.kind === "duplicate").slice(0, 50).map((f) => ({ project: f.project, title: f.titles[0], taskIds: f.stepIds })),
          unreviewedByProject: findings.filter((f) => f.kind === "unreviewed").map((f) => ({ project: f.project, count: f.stepIds.length })),
          asked,
          alreadyAsked: skipped,
          next_actions: [
            idle.length ? `Put each idle card back to Up next with a note saying why: update_task({ taskId, status: "pending" }) and add_task_comment. It is in progress only while an agent holds it.` : "",
            counts.duplicate && !ask ? "Run again with ask: true to put the twins to the owner, one question per project." : "",
            asked.length ? "When he answers, queue_claim the answer and do what it says." : "",
          ].filter(Boolean),
        })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "upkeep_runs",
    "What earlier upkeep runs checked, found and asked, newest first: the record that says whether a check is worth running.",
    {
      kind: z.string().max(40).optional().describe("Only this kind, e.g. stale_check"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ kind, limit }: { kind?: string; limit?: number }) => {
      try {
        const userId = getMcpUserId()
        const rows = (await sql`
          SELECT id, kind, project_id, ran_by, ran_at, checked, found - 'findings' AS counts, asked
            FROM upkeep_runs
           WHERE user_id = ${userId} AND (${kind ?? null}::text IS NULL OR kind = ${kind ?? null})
           ORDER BY ran_at DESC
           LIMIT ${limit ?? 10}
        `) as Record<string, unknown>[]
        return ok({ runs: rows })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )
}
