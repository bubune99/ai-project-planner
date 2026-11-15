/**
 * POST /api/inbox/:id — answer a question (or release a paused job).
 *
 * Body: { option?: string, reply?: string }. option must be one of the options
 * the agent offered, exactly. A question becomes 'completed' with the answer
 * in result + unlock_note, where get_answer reads it; a paused job goes back
 * to 'queued' with the note, as resolve_unlock does.
 *
 * The UPDATE is conditional on status = 'awaiting-unlock', so a double tap or
 * a second device answering the same card gets a 409 rather than overwriting.
 *
 * DELETE /api/inbox/:id — take an answer back, so the question waits again. Allowed only while nothing has acted
 * on the answer (lib/queue/item-state.ts mayUndo). What he had said is kept in the record.
 */
import { NextRequest } from "next/server"
import { sql } from "@/lib/db/client"
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { toInboxItem, resolveAnswer, statusAfterAnswer } from "@/lib/inbox"
import { answeredRow } from "@/lib/mcp/queue-tools"
import { mayUndo, undoPatch } from "@/lib/queue/item-state"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401)
    const { id } = await params
    if (!UUID.test(id)) return errorResponse(ErrorCodes.NOT_FOUND, "Not found", 404)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return errorResponse(ErrorCodes.BAD_REQUEST, "JSON body required", 400)

    const [row] = (await sql`
      SELECT id, title, unlock_prompt, created_by, assigned_to, created_at, input, status
      FROM agent_jobs WHERE id = ${id} AND created_by = ${auth.userId}
    `) as Record<string, any>[]
    if (!row) return errorResponse(ErrorCodes.NOT_FOUND, "Not found", 404)
    if (row.status !== "awaiting-unlock") return errorResponse(ErrorCodes.CONFLICT, "Already answered", 409)

    const item = toInboxItem(row, {})
    const checked = resolveAnswer(item, body)
    if (!checked.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, checked.error, 400)
    const { answer } = checked
    const status = statusAfterAnswer(item.kind)

    const [updated] = (await sql`
      UPDATE agent_jobs
      SET status = ${status},
          unlock_resolved_at = NOW(),
          unlock_resolved_by = ${auth.userId},
          unlock_note = ${answer.note},
          result = ${JSON.stringify({ answer: { option: answer.option, reply: answer.reply } })}::jsonb,
          completed_at = CASE WHEN ${status} = 'completed' THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE id = ${id} AND created_by = ${auth.userId} AND status = 'awaiting-unlock'
      RETURNING id, status, unlock_note, unlock_resolved_at
    `) as Record<string, any>[]
    if (!updated) return errorResponse(ErrorCodes.CONFLICT, "Already answered", 409)

    return successResponse({ id: updated.id, status: updated.status, answer })
  } catch (error: unknown) {
    console.error("POST /api/inbox/:id failed:", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to save answer", 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401)
    // Taking an answer back is the owner's own act: a signed-in session only, never an agent's key.
    if (auth.authType !== "session") return errorResponse(ErrorCodes.FORBIDDEN, "Only the owner can take an answer back", 403)
    const { id } = await params
    const found = await answeredRow(id, auth.userId)
    if (!found) return errorResponse(ErrorCodes.NOT_FOUND, "Not found", 404)
    const verdict = mayUndo(found.row)
    if (!verdict.ok) return errorResponse(ErrorCodes.CONFLICT, verdict.why, 409)

    const metadata = undoPatch(found.metadata, { was: found.was, now: Date.now() })
    // Conditional on nobody having picked it up in the meantime: an agent's claim wins the race.
    const [updated] = (await sql`
      UPDATE agent_jobs
      SET status = 'awaiting-unlock', unlock_resolved_at = NULL, unlock_resolved_by = NULL, unlock_note = NULL,
          result = NULL, completed_at = NULL, metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND created_by = ${auth.userId} AND status = 'completed'
        AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'claimedBy') AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doneAt')
        AND NOT EXISTS (SELECT 1 FROM gate_plan_changes c WHERE c.question_id = agent_jobs.id AND c.status IN ('approved', 'rejected'))
      RETURNING id, status
    `) as Record<string, any>[]
    if (!updated) return errorResponse(ErrorCodes.CONFLICT, "Something picked this up just now. Refresh to see where it went.", 409)
    return successResponse({ id: updated.id, status: updated.status, was: found.was })
  } catch (error: unknown) {
    console.error("DELETE /api/inbox/:id failed:", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Could not take the answer back", 500)
  }
}
