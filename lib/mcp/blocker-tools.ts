/**
 * Blocker tools (card 570e7e98): the queue of cards that are waiting on something, and how each was cleared.
 *
 *   list_blockers    open blockers in the order to deal with them (waiting on the owner first, then the oldest),
 *                    with recently cleared ones and how long clearing took
 *   raise_blocker    block a card and say what it waits on (the owner, another card, someone outside)
 *   resolve_blocker  say how it was cleared and move the card on
 *
 * The record itself (step_blockers) is kept by a trigger on the card's status (migration 080), so a card blocked or
 * unblocked on the board is recorded too. The rules are in lib/blockers/blocker-model.ts (pure, asserted). This file
 * does access and SQL only. Each tool is classified in lib/agents/risk.ts.
 */
import { z } from "zod"
import { sql } from "@/lib/db/client"
import { getMcpUserId, requireMcpScope, verifyMcpProjectAccess } from "@/lib/auth/mcp-context"
import { blockerLine, clearedSummary, queueOrder, waitingOnOf, WAITING_ON, type Blocker } from "@/lib/blockers/blocker-model"

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true }
}
const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error")
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOVE_TO_DEFAULT = ["requested", "pending", "in-progress", "paused"]

/** The card, if the caller may write to its project. */
async function writableStep(taskId: string): Promise<{ id: string; project_id: string; status: string } | string> {
  if (!UUID.test(taskId)) return "Card not found or access denied"
  const [step] = (await sql`SELECT id, project_id, status FROM project_steps WHERE id = ${taskId} AND deleted_at IS NULL`) as { id: string; project_id: string; status: string }[]
  if (!step) return "Card not found or access denied"
  const access = await verifyMcpProjectAccess(step.project_id)
  if (!access.hasAccess) return "Card not found or access denied"
  if (!access.canWrite) return "You have read-only access to this project."
  return step
}

const toBlocker = (r: Record<string, unknown>): Blocker & { project?: string; projectId?: string; questionId?: string | null; dependsOnTaskId?: string | null; raisedBy?: string | null } => ({
  id: String(r.id),
  stepId: String(r.step_id),
  title: r.title ? String(r.title) : undefined,
  project: r.project_name ? String(r.project_name) : undefined,
  projectId: r.project_id ? String(r.project_id) : undefined,
  reason: String(r.reason),
  waitingOn: waitingOnOf(r.waiting_on),
  questionId: (r.question_id as string | null) ?? null,
  dependsOnTaskId: (r.depends_on_step_id as string | null) ?? null,
  raisedBy: (r.raised_by as string | null) ?? null,
  raisedAt: new Date(r.raised_at as string).toISOString(),
  resolvedAt: r.resolved_at ? new Date(r.resolved_at as string).toISOString() : null,
  resolvedBy: (r.resolved_by as string | null) ?? null,
  resolution: (r.resolution as string | null) ?? null,
})

export function registerBlockerTools(server: any): void {
  server.tool(
    "list_blockers",
    "The blocker queue: cards waiting on something, waiting-on-the-owner first then the oldest, each with a one-line summary; plus blockers cleared in the last 30 days and the middle time it took to clear one. Scoped to the projects you can see.",
    {
      projectId: z.string().optional().describe("Only this project"),
      includeCleared: z.boolean().optional().describe("Also list blockers cleared in the last 30 days (default true)"),
    },
    async ({ projectId, includeCleared }: { projectId?: string; includeCleared?: boolean }) => {
      try {
        const userId = getMcpUserId()
        if (projectId && !UUID.test(projectId)) return fail("projectId must be a project id")
        const rows = (await sql`
          SELECT b.*, s.title, p.name AS project_name
            FROM step_blockers b
            JOIN project_steps s ON s.id = b.step_id AND s.deleted_at IS NULL
            JOIN projects p ON p.id = b.project_id AND p.deleted_at IS NULL
           WHERE (${projectId ?? null}::uuid IS NULL OR b.project_id = ${projectId ?? null}::uuid)
             AND (p.user_id = ${userId} OR EXISTS (
                   SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = ${userId}
                      AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))
             AND (b.resolved_at IS NULL OR b.resolved_at > now() - interval '30 days')
           ORDER BY b.raised_at DESC
           LIMIT 300
        `) as Record<string, unknown>[]
        const all = rows.map(toBlocker)
        const now = Date.now()
        const open = queueOrder(all).map((b) => ({ ...b, line: blockerLine(b, now) }))
        const cleared = all.filter((b) => b.resolvedAt)
        return ok({
          open,
          openCount: open.length,
          ...(includeCleared === false ? {} : { recentlyCleared: cleared.slice(0, 50), ...clearedSummary(cleared) }),
          next_actions: open.length
            ? [`Deal with the first: ${open[0].line}. Clear one with resolve_blocker({ taskId, resolution }).`]
            : ["Nothing is blocked."],
        })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "raise_blocker",
    "Block a card and say what it waits on. Moves the card to the blocked column and records the blocker; if the card is already blocked, updates what it waits on. Waiting on the owner? Ask him with ask_owner first and pass its questionId here.",
    {
      taskId: z.string().describe("The card that is blocked"),
      reason: z.string().min(3).max(500).describe("What it is waiting for, in plain words"),
      waitingOn: z.enum(WAITING_ON as [string, ...string[]]).optional().describe("owner, card, outside or unknown"),
      questionId: z.string().optional().describe("The owner's inbox question this waits on"),
      dependsOnTaskId: z.string().optional().describe("The card this waits on"),
      by: z.string().max(120).optional().describe("Your agent name"),
    },
    async (args: { taskId: string; reason: string; waitingOn?: string; questionId?: string; dependsOnTaskId?: string; by?: string }) => {
      try {
        requireMcpScope("write")
        const step = await writableStep(args.taskId)
        if (typeof step === "string") return fail(step)
        if (args.questionId && !UUID.test(args.questionId)) return fail("questionId must be an id")
        if (args.dependsOnTaskId && (!UUID.test(args.dependsOnTaskId) || args.dependsOnTaskId === step.id)) return fail("dependsOnTaskId must be another card's id")
        const text = args.reason.trim()
        await sql`UPDATE project_steps SET blocked_reason = ${text}, status = 'blocked', updated_at = now() WHERE id = ${step.id}`
        const waiting = waitingOnOf(args.waitingOn ?? (args.questionId ? "owner" : args.dependsOnTaskId ? "card" : "unknown"))
        const [row] = (await sql`
          UPDATE step_blockers
             SET reason = ${text}, waiting_on = ${waiting}, question_id = ${args.questionId ?? null},
                 depends_on_step_id = ${args.dependsOnTaskId ?? null}, raised_by = ${args.by ?? "agent"}
           WHERE step_id = ${step.id} AND resolved_at IS NULL
          RETURNING *
        `) as Record<string, unknown>[]
        if (!row) return fail("The card was blocked but its record could not be found; check migration 080")
        const b = toBlocker(row)
        return ok({ blocker: b, line: blockerLine(b, Date.now()), next_actions: ["When it is cleared: resolve_blocker({ taskId, resolution })."] })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )

  server.tool(
    "resolve_blocker",
    "Say how a blocked card was cleared and move it on (default: back to Up next). The record keeps the resolution, who cleared it and how long it waited.",
    {
      taskId: z.string().describe("The blocked card"),
      resolution: z.string().min(3).max(500).describe("How it was cleared"),
      moveTo: z.string().optional().describe("Column to move it to (default 'pending', Up next)"),
      by: z.string().max(120).optional().describe("Your agent name"),
    },
    async (args: { taskId: string; resolution: string; moveTo?: string; by?: string }) => {
      try {
        requireMcpScope("write")
        const step = await writableStep(args.taskId)
        if (typeof step === "string") return fail(step)
        const moveTo = (args.moveTo || "pending").trim()
        const custom = (await sql`SELECT key FROM project_statuses WHERE project_id = ${step.project_id} AND deleted_at IS NULL AND kind IN ('open', 'active')`) as { key: string }[]
        const allowed = custom.length ? custom.map((c) => c.key) : MOVE_TO_DEFAULT
        if (!allowed.includes(moveTo)) return fail(`moveTo must be one of: ${allowed.join(", ")}`)
        const [open] = (await sql`
          UPDATE step_blockers SET resolution = ${args.resolution.trim()}, resolved_by = ${args.by ?? "agent"}
           WHERE step_id = ${step.id} AND resolved_at IS NULL
          RETURNING id
        `) as { id: string }[]
        if (!open) return fail("This card has no open blocker")
        if (step.status === "blocked") {
          // The trigger closes the record and keeps the resolution written above.
          await sql`UPDATE project_steps SET status = ${moveTo}, blocked_reason = NULL, updated_at = now() WHERE id = ${step.id}`
        } else {
          await sql`UPDATE step_blockers SET resolved_at = now() WHERE id = ${open.id}`
        }
        const [row] = (await sql`SELECT * FROM step_blockers WHERE id = ${open.id}`) as Record<string, unknown>[]
        const b = toBlocker(row)
        const hours = b.resolvedAt ? Math.round(((Date.parse(b.resolvedAt) - Date.parse(b.raisedAt)) / 3_600_000) * 10) / 10 : null
        return ok({ blocker: b, waitedHours: hours, movedTo: step.status === "blocked" ? moveTo : step.status })
      } catch (e) {
        return fail(reason(e))
      }
    }
  )
}
