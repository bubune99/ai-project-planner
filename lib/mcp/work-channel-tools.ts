/**
 * The two-way channel (card f56c9ba0): a coding session says it finished, the platform side compares the claim with
 * the record and accepts it (assigning the next card) or sends it back with requests; any agent can ask a session
 * for a check or a picture, and the request stays owed until answered with a real result.
 *
 *   work_finished   a session says a card is finished, with the commit and what it saw; reviewed at once
 *   work_request    ask a session's agent for something (a check, a screenshot at a width, proof of a claim)
 *   work_reply      answer a request with what was seen, or a stated reason it cannot be done
 *   work_owed       requests still owed by an agent: the plugin's listener and finish hook read this
 *   work_thread     the messages about a project, a card or an agent, oldest first
 *
 * Rules in lib/threads/work-channel.ts (pure, asserted). Store: work_messages (migration 082). The platform side can
 * only ask, compare, assign and raise; it never approves production, changes a rule or loosens a check.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpScope, verifyMcpProjectAccess } from "@/lib/auth/mcp-context"
import { assignText, isRealProof, nextCard, reviewFinish, type Card, type Evidence } from "@/lib/threads/work-channel"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGENT = z.string().min(2).max(120).describe("The session agent's stable name, e.g. claude-code@ai-project-planner")

async function canWrite(projectId: string): Promise<string | null> {
  if (!UUID.test(projectId)) return "projectId must be a project id"
  const access = await verifyMcpProjectAccess(projectId)
  if (!access.hasAccess) return "Project not found or access denied"
  if (!access.canWrite) return "You have read-only access to this project."
  return null
}
async function canRead(projectId: string): Promise<string | null> {
  if (!UUID.test(projectId)) return "projectId must be a project id"
  const access = await verifyMcpProjectAccess(projectId)
  return access.hasAccess ? null : "Project not found or access denied"
}
async function stepIn(projectId: string, taskId: string | undefined): Promise<string | null> {
  if (!taskId) return null
  if (!UUID.test(taskId)) return "taskId must be a card id"
  const [s] = (await sql`SELECT 1 FROM project_steps WHERE id = ${taskId} AND project_id = ${projectId} AND deleted_at IS NULL`) as unknown[]
  return s ? null : "That card is not in this project"
}

async function post(m: { projectId: string; taskId?: string | null; agent: string; side: "session" | "platform" | "owner"; kind: string; body: string; proof?: unknown; replyTo?: string | null; status?: string }) {
  const [row] = (await sql`
    INSERT INTO work_messages (project_id, step_id, agent, from_side, kind, body, proof, reply_to, status, created_by)
    VALUES (${m.projectId}, ${m.taskId ?? null}, ${m.agent}, ${m.side}, ${m.kind}, ${m.body.slice(0, 4000)},
            ${JSON.stringify(m.proof ?? {})}::jsonb, ${m.replyTo ?? null}, ${m.status ?? (m.kind === "request" ? "open" : "closed")}, ${getMcpUserId()})
    RETURNING id, created_at
  `) as { id: string; created_at: string }[]
  return row
}

export function registerWorkChannelTools(server: any): void {
  server.tool(
    "work_finished",
    "Say a card is finished. The claim is compared at once with the record: a ship record for the commit that says what was seen, a before/after pair when the change can be seen, the card closed, and proof that is more than 'ok'. Accepted: the next card is assigned to you. Sent back: one request per missing piece, owed until answered (work_reply).",
    {
      projectId: z.string(),
      taskId: z.string().describe("The card that is finished"),
      agent: AGENT,
      sha: z.string().max(64).optional().describe("The commit that carries the change"),
      visible: z.boolean().optional().describe("The change can be seen on a screen (a before/after pair is then owed)"),
      deploys: z.boolean().optional().describe("False when the commit is in a repository that deploys nothing (a plugin, a library): no ship record is owed, the proof is the evidence"),
      proof: z.string().max(2000).describe("What you saw and where: the address and the value or picture"),
    },
    async (a: { projectId: string; taskId: string; agent: string; sha?: string; visible?: boolean; deploys?: boolean; proof: string }) => {
      try {
        requireMcpScope("write")
        const err = (await canWrite(a.projectId)) ?? (await stepIn(a.projectId, a.taskId))
        if (err) return fail(err)
        const sha = a.sha?.trim().toLowerCase() || null
        const prefix = sha ? sha.slice(0, 7) : "-"
        const ships = (await sql`
          SELECT env, sha, note FROM gate_ships
           WHERE project_id = ${a.projectId} AND (left(sha, 7) = ${prefix})
           ORDER BY shipped_at DESC LIMIT 10
        `) as Evidence["ships"]
        const changes = (await sql`
          SELECT stage, build FROM gate_changes
           WHERE project_id = ${a.projectId} AND build IS NOT NULL AND left(build, 7) = ${prefix}
           LIMIT 10
        `) as Evidence["changes"]
        const [card] = (await sql`
          SELECT COALESCE(ps.kind, CASE s.status WHEN 'in-progress' THEN 'active' WHEN 'completed' THEN 'done'
                 WHEN 'blocked' THEN 'closed' WHEN 'failed' THEN 'closed' ELSE 'open' END) AS kind
            FROM project_steps s LEFT JOIN project_statuses ps ON ps.project_id = s.project_id AND ps.key = s.status AND ps.deleted_at IS NULL
           WHERE s.id = ${a.taskId}
        `) as { kind: Evidence["cardKind"] }[]
        const review = reviewFinish({ taskId: a.taskId, sha, visible: a.visible, deploys: a.deploys, proof: a.proof }, { ships, changes, cardKind: card?.kind ?? null })

        const finished = await post({ projectId: a.projectId, taskId: a.taskId, agent: a.agent, side: "session", kind: "finished", body: a.proof, proof: { sha, visible: !!a.visible, deploys: a.deploys !== false } })
        if (review.verdict === "sent_back") {
          await post({ projectId: a.projectId, taskId: a.taskId, agent: a.agent, side: "platform", kind: "sent_back", body: `Not accepted yet: ${review.requests.length} thing${review.requests.length === 1 ? "" : "s"} missing.`, replyTo: finished.id })
          const requests = []
          for (const r of review.requests) {
            const m = await post({ projectId: a.projectId, taskId: a.taskId, agent: a.agent, side: "platform", kind: "request", body: r, replyTo: finished.id })
            requests.push({ requestId: m.id, ask: r })
          }
          return ok({ verdict: "sent_back", requests, next_actions: ["Do each request, then answer it with work_reply({ requestId, body: what you saw }); then call work_finished again."] })
        }

        await post({ projectId: a.projectId, taskId: a.taskId, agent: a.agent, side: "platform", kind: "accepted", body: "Accepted: the record matches the claim.", replyTo: finished.id })
        const open = (await sql`
          SELECT s.id, s.title, s.priority, s.order_index, s.assigned_agent
            FROM project_steps s
           WHERE s.project_id = ${a.projectId} AND s.deleted_at IS NULL AND s.status = 'pending' AND s.parent_task_id IS NULL
             -- Never a card only the owner can do (075) or an initiative: the same cards the plugin's queue skips.
             AND COALESCE(s.work_kind, 'task') NOT IN ('owner', 'initiative')
             AND NOT EXISTS (SELECT 1 FROM agent_jobs j WHERE j.parent_step_id = s.id AND j.status = 'awaiting-unlock')
           ORDER BY s.order_index NULLS LAST
           LIMIT 400
        `) as { id: string; title: string; priority: string | null; order_index: number | null; assigned_agent: string | null }[]
        const cards: Card[] = open.map((c) => ({ id: c.id, title: c.title, priority: c.priority, orderIndex: c.order_index, kind: "open", assignedTo: c.assigned_agent }))
        const next = nextCard(cards, a.taskId)
        if (next) await post({ projectId: a.projectId, taskId: next.id, agent: a.agent, side: "platform", kind: "assign", body: assignText(next), replyTo: finished.id })
        return ok({
          verdict: "accepted",
          next: next ? { taskId: next.id, title: next.title, priority: next.priority } : null,
          next_actions: next ? [assignText(next)] : ["Nothing is left in Up next for this project."],
        })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "work_request",
    "Ask a session's agent for something: run a check, take a screenshot at a width, show the proof for a claim. It stays owed by that agent until answered (work_reply) and reaches it through the plugin's listener.",
    {
      projectId: z.string(),
      agent: AGENT,
      body: z.string().min(10).max(2000).describe("What to do and what to send back"),
      taskId: z.string().optional().describe("The card it is about"),
    },
    async (a: { projectId: string; agent: string; body: string; taskId?: string }) => {
      try {
        requireMcpScope("write")
        const err = (await canWrite(a.projectId)) ?? (await stepIn(a.projectId, a.taskId))
        if (err) return fail(err)
        const m = await post({ projectId: a.projectId, taskId: a.taskId, agent: a.agent, side: "platform", kind: "request", body: a.body })
        return ok({ requestId: m.id, next_actions: ["The agent answers with work_reply; read it with work_thread."] })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "work_reply",
    "Answer a request with what you saw (the address and the value, or a picture's description), or with a stated reason it cannot be done. 'ok' or 'done' is refused.",
    {
      requestId: z.string(),
      agent: AGENT,
      body: z.string().max(4000).describe("What you did and saw, or why it cannot be done"),
      cannot: z.boolean().optional().describe("True when you are saying why it cannot be done"),
    },
    async (a: { requestId: string; agent: string; body: string; cannot?: boolean }) => {
      try {
        requireMcpScope("write")
        if (!UUID.test(a.requestId)) return fail("requestId must be a request id")
        const [req] = (await sql`SELECT id, project_id, step_id, agent, status FROM work_messages WHERE id = ${a.requestId} AND kind = 'request'`) as { id: string; project_id: string; step_id: string | null; agent: string; status: string }[]
        if (!req) return fail("Request not found")
        const err = await canWrite(req.project_id)
        if (err) return fail(err)
        if (req.agent !== a.agent) return fail(`This request is owed by ${req.agent}, not ${a.agent}`)
        if (req.status !== "open") return fail("This request was already answered")
        if (!isRealProof(a.body)) return fail("Say what you saw and where, or why it cannot be done. 'ok' or 'done' is not an answer.")
        const m = await post({ projectId: req.project_id, taskId: req.step_id, agent: a.agent, side: "session", kind: "result", body: a.body, proof: { cannot: !!a.cannot }, replyTo: req.id })
        await sql`UPDATE work_messages SET status = 'answered', answered_at = now() WHERE id = ${req.id}`
        const [left] = (await sql`SELECT count(*)::int AS n FROM work_messages WHERE agent = ${a.agent} AND project_id = ${req.project_id} AND kind = 'request' AND status = 'open'`) as { n: number }[]
        return ok({ resultId: m.id, stillOwed: left.n })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "work_owed",
    "Requests an agent still owes, oldest first. The plugin's listener and finish hook read this; answer each with work_reply.",
    {
      agent: AGENT,
      projectId: z.string().optional().describe("Only this project"),
    },
    async (a: { agent: string; projectId?: string }) => {
      try {
        if (a.projectId) { const err = await canRead(a.projectId); if (err) return fail(err) }
        const userId = getMcpUserId()
        const rows = (await sql`
          SELECT m.id, m.project_id, p.name AS project, m.step_id, s.title AS card, m.body, m.created_at
            FROM work_messages m
            JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
            LEFT JOIN project_steps s ON s.id = m.step_id
           WHERE m.agent = ${a.agent} AND m.kind = 'request' AND m.status = 'open'
             AND (${a.projectId ?? null}::uuid IS NULL OR m.project_id = ${a.projectId ?? null}::uuid)
             AND (p.user_id = ${userId} OR EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = ${userId}
                  AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))
           ORDER BY m.created_at
           LIMIT 100
        `) as Record<string, unknown>[]
        return ok({ owed: rows.map((r) => ({ requestId: r.id, projectId: r.project_id, project: r.project, taskId: r.step_id, card: r.card, ask: r.body, at: r.created_at })), count: rows.length })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "work_thread",
    "The channel's messages for a project, oldest first: finish claims, what was accepted or sent back, requests and their results, assignments. Narrow it to a card or an agent.",
    {
      projectId: z.string(),
      taskId: z.string().optional(),
      agent: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async (a: { projectId: string; taskId?: string; agent?: string; limit?: number }) => {
      try {
        const err = await canRead(a.projectId)
        if (err) return fail(err)
        if (a.taskId && !UUID.test(a.taskId)) return fail("taskId must be a card id")
        const rows = (await sql`
          SELECT id, step_id, agent, from_side, kind, body, proof, reply_to, status, created_at, answered_at
            FROM work_messages
           WHERE project_id = ${a.projectId}
             AND (${a.taskId ?? null}::uuid IS NULL OR step_id = ${a.taskId ?? null}::uuid)
             AND (${a.agent ?? null}::text IS NULL OR agent = ${a.agent ?? null})
           ORDER BY created_at DESC
           LIMIT ${a.limit ?? 50}
        `) as Record<string, unknown>[]
        return ok({ messages: rows.reverse() })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )
}
