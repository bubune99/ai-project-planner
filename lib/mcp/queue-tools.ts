/**
 * Queue tools: what happens to the owner's answer after he gives it.
 *
 *   queue_answers   every answer of his that is not finished: not picked up, or picked up and still being worked
 *   queue_claim     an agent takes an answer (the asker first; the project's agents after a grace period)
 *   queue_done      the agent says what it did with the answer; only then is the item finished
 *
 * The rules are in lib/queue/item-state.ts (pure, asserted). This file does access and SQL only. Claim data is
 * kept in agent_jobs.metadata, so no table change is needed.
 *
 * Wire-up: registerQueueTools(server) in registerPlannerTools. Each tool is classified in lib/agents/risk.ts.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpContextOrNull, getMcpUserId, requireMcpScope } from "@/lib/auth/mcp-context"
import { QueueError, claimPatch, donePatch, itemState, mayClaim, mayUndo, planChangeNote, routing, wakeFor, whereItWent, type ItemRow } from "@/lib/queue/item-state"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface JobRow { id: string; title: string; status: string; assigned_to: string | null; input: Record<string, unknown> | null; metadata: Record<string, unknown> | null; result: { answer?: { option: string | null; reply: string | null } } | null; unlock_note: string | null; unlock_prompt: string | null; unlock_resolved_at: string | null; created_at: string }

/** A decided change to a page's plan that this question was about, when there is one. */
interface PlanChange { pc_action: string | null; pc_label: string | null; pc_route: string | null; pc_status: string | null; pc_decided_at: string | null }
const appliedOf = (j: Partial<PlanChange>): ItemRow["applied"] => {
  if (!j.pc_status || !j.pc_route) return null
  const what = planChangeNote({ action: j.pc_action ?? "add", label: j.pc_label ?? null, route: j.pc_route, status: j.pc_status })
  return what ? { at: j.pc_decided_at ? new Date(j.pc_decided_at).toISOString() : null, what } : null
}

export const toItemRow = (j: Pick<JobRow, "status" | "assigned_to" | "input" | "metadata" | "unlock_resolved_at"> & Partial<PlanChange>): ItemRow => ({
  applied: appliedOf(j),
  status: j.status, askedBy: j.assigned_to,
  projectId: typeof j.input?.projectId === "string" ? j.input.projectId : null,
  answeredAt: j.unlock_resolved_at ? new Date(j.unlock_resolved_at).toISOString() : null,
  metadata: j.metadata && typeof j.metadata === "object" ? j.metadata : null,
})

const answerOf = (j: JobRow) => j.result?.answer?.option || j.result?.answer?.reply || j.unlock_note || null

/** One answered question with what the planner did with it, for the owner's undo. Null when it is not his or not found. */
export async function answeredRow(questionId: string, userId: string) {
  if (!UUID.test(questionId)) return null
  const [j] = (await sql`
    SELECT j.id, j.title, j.status, j.assigned_to, j.input, j.metadata, j.result, j.unlock_note, j.unlock_prompt, j.unlock_resolved_at, j.created_at,
           c.action AS pc_action, c.item->>'label' AS pc_label, c.route AS pc_route, c.status AS pc_status, c.decided_at AS pc_decided_at
    FROM agent_jobs j
    LEFT JOIN LATERAL (SELECT action, item, route, status, decided_at FROM gate_plan_changes WHERE question_id = j.id LIMIT 1) c ON true
    WHERE j.id = ${questionId} AND j.created_by = ${userId} AND j.unlock_prompt IS NOT NULL
  `) as (JobRow & Partial<PlanChange>)[]
  return j ? { row: toItemRow(j), was: answerOf(j), metadata: j.metadata } : null
}

function describe(j: JobRow & Partial<PlanChange>, now: number) {
  const row = toItemRow(j), r = routing(row)
  return {
    questionId: j.id, question: j.unlock_prompt || j.title, answer: answerOf(j), answeredAt: row.answeredAt,
    state: itemState(row), projectId: row.projectId, askedBy: r.askedBy, askedFrom: r.askedFrom,
    claimedBy: r.claimedBy, claimedAt: r.claimedAt, where: whereItWent(row, now), canUndo: mayUndo(row).ok,
  }
}

async function load(questionId: string, userId: string): Promise<JobRow | null> {
  if (!UUID.test(questionId)) return null
  const [j] = (await sql`
    SELECT id, title, status, assigned_to, input, metadata, result, unlock_note, unlock_prompt, unlock_resolved_at, created_at
    FROM agent_jobs WHERE id = ${questionId} AND created_by = ${userId} AND unlock_prompt IS NOT NULL
  `) as JobRow[]
  return j ?? null
}

/** Answered items that are not finished, newest answer first. Shared with GET /api/inbox?view=answered. */
export async function openAnswers(userId: string, a: { projectId?: string | null; sinceDays?: number; includeDone?: boolean } = {}) {
  const days = Math.min(Math.max(a.sinceDays ?? 30, 1), 365)
  const rows = (await sql`
    SELECT j.id, j.title, j.status, j.assigned_to, j.input, j.metadata, j.result, j.unlock_note, j.unlock_prompt, j.unlock_resolved_at, j.created_at,
           c.action AS pc_action, c.item->>'label' AS pc_label, c.route AS pc_route, c.status AS pc_status, c.decided_at AS pc_decided_at
    FROM agent_jobs j
    LEFT JOIN LATERAL (SELECT action, item, route, status, decided_at FROM gate_plan_changes WHERE question_id = j.id LIMIT 1) c ON true
    WHERE j.created_by = ${userId} AND j.unlock_prompt IS NOT NULL AND j.status NOT IN ('awaiting-unlock', 'cancelled', 'failed')
      AND j.unlock_resolved_at > now() - (${days}::int * interval '1 day')
      AND (${a.projectId ?? null}::text IS NULL OR j.input->>'projectId' = ${a.projectId ?? null})
    ORDER BY j.unlock_resolved_at DESC LIMIT 300
  `) as (JobRow & Partial<PlanChange>)[]
  const now = Date.now()
  const all = rows.map((j) => describe(j, now))
  return a.includeDone ? all : all.filter((i) => i.state !== "done")
}

export function registerQueueTools(server: any): void {
  server.tool(
    "queue_answers",
    "The owner's answers that have not been finished: not picked up by any agent, or picked up and still being worked. Call this at the start of a session and whenever the owner says he has answered; it does not depend on which folder asked. Then queue_claim each one that is yours or your project's.",
    {
      projectId: z.string().optional().describe("Only answers for this project"),
      state: z.enum(["unclaimed", "claimed", "all"]).optional().describe("Default: unclaimed and claimed (everything not finished)"),
      sinceDays: z.number().int().optional().describe("How far back to look (default 30)"),
    },
    async ({ projectId, state, sinceDays }: { projectId?: string; state?: "unclaimed" | "claimed" | "all"; sinceDays?: number }) => {
      try {
        const items = await openAnswers(getMcpUserId(), { projectId, sinceDays, includeDone: state === "all" })
        const shown = state === "unclaimed" || state === "claimed" ? items.filter((i) => i.state === state) : items
        const unclaimed = shown.filter((i) => i.state === "unclaimed").length
        return ok({ count: shown.length, unclaimed, items: shown, next_actions: unclaimed ? [`${unclaimed} answer${unclaimed === 1 ? " has" : "s have"} not been picked up. queue_claim each one you will act on, act, then queue_done with what you did.`] : ["Nothing is waiting to be picked up."] })
      } catch (e) { return fail(reason(e)) }
    },
  )

  /*
    The device calls out and holds the line (owner's choice, 2026-11-14: "The first one would likely be what I would
    use"). A listener on his machine or the home server calls this and the planner keeps the call open until an answer
    nobody has picked up, or new work for the device, exists, then answers at once. Nothing reaches into the machine.
  */
  server.tool(
    "wait_for_work",
    "Hold the call open (up to 55 seconds) until the owner has answered something nobody has picked up, or a job was sent to the device's agents after `since`; then return them at once. Call again in a loop for a working session. Answers from any folder are returned, each with its project.",
    {
      since: z.string().optional().describe("ISO time: only jobs sent after it (default: now minus 60 seconds)"),
      projectId: z.string().optional().describe("Only this project's answers and jobs"),
      timeoutSec: z.number().int().min(1).max(55).optional().describe("How long to hold the call (default 45)"),
      seen: z.array(z.string().max(80)).max(500).optional().describe("Question ids you were already handed and are not acting on: the call does not wake for these again"),
    },
    async ({ since, projectId, timeoutSec, seen }: { since?: string; projectId?: string; timeoutSec?: number; seen?: string[] }) => {
      try {
        const userId = getMcpUserId()
        const from = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : new Date(Date.now() - 60000).toISOString()
        const until = Date.now() + Math.min(timeoutSec ?? 45, 55) * 1000
        for (;;) {
          const answers = wakeFor(await openAnswers(userId, { projectId, sinceDays: 30 }), seen)
          const jobs = (await sql`
            SELECT id, title, priority, input, created_at FROM agent_jobs
             WHERE created_by = ${userId} AND status = 'pending' AND created_at > ${from}::timestamptz
               AND NOT ('question' = ANY(COALESCE(tags, '{}')))
               AND (${projectId ?? null}::text IS NULL OR input->>'projectId' = ${projectId ?? null})
             ORDER BY created_at
             LIMIT 50
          `) as { id: string; title: string; priority: string; input: any; created_at: string }[]
          if (answers.length || jobs.length || Date.now() >= until) {
            return ok({
              arrived: answers.length + jobs.length,
              answers,
              jobs: jobs.map((j) => ({ id: j.id, title: j.title, priority: j.priority, projectId: j.input?.projectId ?? null, stepId: j.input?.stepId ?? null, sentAt: j.created_at })),
              checkedUntil: new Date().toISOString(),
              next_actions: answers.length ? ["queue_claim each answer you act on, then queue_done with what you did"] : [],
            })
          }
          await new Promise((r) => setTimeout(r, 2500))
        }
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "queue_claim",
    "Take one of the owner's answers so he can see who has it. The agent that asked may always claim; another agent may when it is working on the same project and the asker has not claimed within the grace period. Claim before acting, and call queue_done when the work is finished.",
    {
      questionId: z.string(),
      agent: z.string().describe("Your stable agent name, e.g. claude-code@planner"),
      projectId: z.string().optional().describe("The project you are working on (needed to take over another agent's answer)"),
      from: z.string().optional().describe("Where you are working: the folder or machine"),
    },
    async ({ questionId, agent, projectId, from }: { questionId: string; agent: string; projectId?: string; from?: string }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const j = await load(questionId, userId)
        if (!j) return fail("Question not found")
        const row = toItemRow(j), now = Date.now()
        const verdict = mayClaim(row, { agent, projectId, now, keyId: getMcpContextOrNull()?.apiKeyId ?? null })
        if (!verdict.ok) return fail(verdict.why)
        const metadata = claimPatch(row.metadata, { agent, from, now })
        await sql`UPDATE agent_jobs SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW() WHERE id = ${j.id} AND created_by = ${userId}`
        return ok({ claimed: true, takenOver: verdict.takenOver, ...describe({ ...j, metadata }, now), next_actions: ["Act on the answer, then queue_done({ questionId, agent, note }) saying what you did."] })
      } catch (e) { return fail(reason(e)) }
    },
  )

  server.tool(
    "queue_done",
    "Say what was done with an answer you claimed. Only then does the owner see the item as finished. The note is a sentence about what happened (what shipped where, or why nothing needed to change), never just 'done'.",
    { questionId: z.string(), agent: z.string(), note: z.string().describe("What you did with the answer") },
    async ({ questionId, agent, note }: { questionId: string; agent: string; note: string }) => {
      try {
        requireMcpScope("write")
        const userId = getMcpUserId()
        const j = await load(questionId, userId)
        if (!j) return fail("Question not found")
        const now = Date.now()
        const metadata = donePatch(toItemRow(j), { agent, note, now })
        await sql`UPDATE agent_jobs SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW() WHERE id = ${j.id} AND created_by = ${userId}`
        return ok({ done: true, ...describe({ ...j, metadata }, now) })
      } catch (e) {
        if (e instanceof QueueError) return fail(e.message)
        return fail(reason(e))
      }
    },
  )
}
