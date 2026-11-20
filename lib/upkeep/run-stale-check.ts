/**
 * The stale-task check as a plain function, so an agent's tool call (lib/mcp/upkeep-tools.ts) and the daily schedule
 * (app/api/cron/upkeep) run the same thing. Owner 2026-11-19 (question e15d7275): "Yes, once a day, putting twins to
 * me as questions". Rules in lib/upkeep/stale-check.ts (pure, asserted). Moves nothing.
 */
import { sql } from "@/lib/db/client"
import { buildQuestionInput } from "@/lib/inbox"
import { notifyOwner } from "@/lib/notify/owner"
import { findStale, questionFor, summarize, type StepRow } from "./stale-check"

export async function runStaleCheck({ userId, projectId, ask, by }: { userId: string; projectId?: string; ask?: boolean; by?: string }) {
    // Only the caller's own projects: a question goes to the caller's own inbox.
    const rows = (await sql`
      SELECT s.id, s.project_id, p.name AS project, s.title, s.description, s.status, s.updated_at, s.created_at,
             (s.source_todo_id IS NOT NULL) AS from_todo,
             EXISTS (SELECT 1 FROM step_comments c WHERE c.step_id = s.id) AS commented,
             COALESCE(ps.kind, CASE s.status WHEN 'in-progress' THEN 'active' WHEN 'completed' THEN 'done'
                                             WHEN 'blocked' THEN 'closed' WHEN 'failed' THEN 'closed' WHEN 'closed' THEN 'closed' ELSE 'open' END) AS kind
        FROM project_steps s
        JOIN projects p ON p.id = s.project_id AND p.deleted_at IS NULL AND p.user_id = ${userId}
        LEFT JOIN project_statuses ps ON ps.project_id = s.project_id AND ps.key = s.status AND ps.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
         AND (${projectId ?? null}::uuid IS NULL OR s.project_id = ${projectId ?? null}::uuid)
    `) as Record<string, unknown>[]
    const steps: StepRow[] = rows.map((r) => ({
      id: String(r.id), projectId: String(r.project_id), project: String(r.project), title: String(r.title ?? ""), description: r.description == null ? undefined : String(r.description),
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
        if (!built.ok) throw new Error(built.error)
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
    return {
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
    }
}
