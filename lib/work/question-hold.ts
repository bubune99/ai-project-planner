/**
 * A question the owner has to answer holds its card (card f473b5d4): the SQL side.
 *
 *   holdCardForQuestion       when a question is asked about a card (ask_owner), or an answer is taken back
 *   releaseCardsAfterAnswer   when the owner answers (POST /api/inbox/:id)
 *
 * What moves and what stays is decided in lib/work/pipeline.ts (whenQuestionAsked, whenQuestionAnswered; pure,
 * asserted). The card remembers its question in its open blocker record (step_blockers.question_id, migration 080),
 * the same record raise_blocker writes, so no table changes. The record itself is opened and closed by the trigger
 * on the card's status.
 *
 * Callers have already checked who is asking or answering. Neither function throws for a card that is gone or was
 * moved meanwhile: the question and the answer stand on their own.
 */
import { sql } from "@/lib/db/client"
import { whenQuestionAnswered, whenQuestionAsked, type OpenHold } from "./pipeline"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASON_MAX = 500

/** A card a question touched, and where the question put it (null: left where it was). */
export interface CardMove { id: string; title: string; projectId: string; moved: "blocked" | "pending" | null }

interface CardRow {
  id: string; title: string; project_id: string; status: string; kind?: string | null
  blocker_id: string | null; question_id: string | null; waiting_on: string | null; depends_on_step_id: string | null
}
const holdOf = (r: CardRow): OpenHold | null =>
  r.blocker_id ? { questionId: r.question_id, waitingOn: r.waiting_on ?? "unknown", dependsOnCard: !!r.depends_on_step_id } : null
const moveOf = (r: CardRow, moved: CardMove["moved"]): CardMove => ({ id: r.id, title: r.title, projectId: r.project_id, moved })

/** The question is open: block its card (unless finished, closed or blocked for a reason of its own) and name the question on it. */
export async function holdCardForQuestion(q: { id: string; stepId: string | null; text: string; askedBy?: string | null }): Promise<CardMove | null> {
  if (!q.stepId || !UUID.test(q.stepId)) return null
  const [card] = (await sql`
    SELECT s.id, s.title, s.project_id, s.status, step_status_kind(s.project_id, s.status) AS kind,
           b.id AS blocker_id, b.question_id, b.waiting_on, b.depends_on_step_id
      FROM project_steps s
      LEFT JOIN step_blockers b ON b.step_id = s.id AND b.resolved_at IS NULL
     WHERE s.id = ${q.stepId} AND s.deleted_at IS NULL
  `) as CardRow[]
  if (!card) return null
  const move = whenQuestionAsked({ status: card.status, kind: card.kind ?? "open" }, holdOf(card))
  if (!move) return moveOf(card, null)

  const reason = q.text.trim().slice(0, REASON_MAX)
  if (move === "block") {
    // Leaving In progress lets go of the card, as update_task does: nobody holds a card that waits on the owner.
    // Conditional on the column it was read in, so a move made in between is not overwritten.
    const [moved] = (await sql`
      UPDATE project_steps
         SET status = 'blocked', blocked_reason = ${reason}, claimed_by_id = NULL, claimed_by_type = NULL, claimed_at = NULL, updated_at = now()
       WHERE id = ${card.id} AND status = ${card.status}
      RETURNING id
    `) as { id: string }[]
    if (!moved) return moveOf(card, null)
    // The status trigger has opened the record; say what it waits on.
    await sql`
      UPDATE step_blockers
         SET waiting_on = 'owner', question_id = ${q.id}, reason = ${reason}, raised_by = ${q.askedBy?.trim() || "agent"}
       WHERE step_id = ${card.id} AND resolved_at IS NULL
    `
    return moveOf(card, "blocked")
  }
  await sql`UPDATE step_blockers SET question_id = ${q.id} WHERE id = ${card.blocker_id} AND resolved_at IS NULL AND question_id IS NULL`
  return moveOf(card, null)
}

/** The owner answered: every card still blocked on this question goes back to Up next, or names the next open question about it. */
export async function releaseCardsAfterAnswer(questionId: string): Promise<CardMove[]> {
  if (!UUID.test(questionId)) return []
  const cards = (await sql`
    SELECT s.id, s.title, s.project_id, s.status, b.id AS blocker_id, b.question_id, b.waiting_on, b.depends_on_step_id
      FROM step_blockers b
      JOIN project_steps s ON s.id = b.step_id AND s.deleted_at IS NULL
     WHERE b.question_id = ${questionId} AND b.resolved_at IS NULL
  `) as CardRow[]
  const out: CardMove[] = []
  for (const card of cards) {
    const others = (await sql`
      SELECT id, COALESCE(unlock_prompt, title) AS text FROM agent_jobs
       WHERE parent_step_id = ${card.id} AND status = 'awaiting-unlock' AND id <> ${questionId}
       ORDER BY created_at
    `) as { id: string; text: string }[]
    const move = whenQuestionAnswered(card.status, holdOf(card), questionId, others.map((o) => o.id))
    if (!move) { out.push(moveOf(card, null)); continue }
    if ("holdFor" in move) {
      const next = String(others.find((o) => o.id === move.holdFor)?.text ?? "").trim().slice(0, REASON_MAX) || "A question in your inbox"
      await sql`UPDATE step_blockers SET question_id = ${move.holdFor}, reason = ${next} WHERE id = ${card.blocker_id} AND resolved_at IS NULL`
      await sql`UPDATE project_steps SET blocked_reason = ${next}, updated_at = now() WHERE id = ${card.id} AND status = 'blocked'`
      out.push(moveOf(card, null))
      continue
    }
    // A project with its own columns and no Up next keeps the card where it is rather than inventing a column.
    const custom = (await sql`SELECT key FROM project_statuses WHERE project_id = ${card.project_id} AND deleted_at IS NULL`) as { key: string }[]
    if (custom.length && !custom.some((c) => c.key === move.to)) { out.push(moveOf(card, null)); continue }
    await sql`
      UPDATE step_blockers SET resolution = 'The owner answered the question it was waiting on', resolved_by = 'owner'
       WHERE id = ${card.blocker_id} AND resolved_at IS NULL
    `
    // The status trigger closes the record and keeps the resolution written above.
    const [moved] = (await sql`
      UPDATE project_steps SET status = ${move.to}, blocked_reason = NULL, updated_at = now()
       WHERE id = ${card.id} AND status = 'blocked'
      RETURNING id
    `) as { id: string }[]
    out.push(moveOf(card, moved ? "pending" : null))
  }
  return out
}

/** The owner took his answer back, so the question waits again: its card is held again, by the same rules as when it was asked. */
export async function holdCardAgain(questionId: string): Promise<CardMove | null> {
  if (!UUID.test(questionId)) return null
  const [q] = (await sql`
    SELECT j.id, j.assigned_to, COALESCE(j.unlock_prompt, j.title) AS text,
           COALESCE(j.parent_step_id, (SELECT b.step_id FROM step_blockers b WHERE b.question_id = j.id ORDER BY b.raised_at DESC LIMIT 1)) AS step_id
      FROM agent_jobs j WHERE j.id = ${questionId} AND j.status = 'awaiting-unlock'
  `) as { id: string; assigned_to: string | null; text: string; step_id: string | null }[]
  if (!q) return null
  return holdCardForQuestion({ id: q.id, stepId: q.step_id, text: q.text, askedBy: q.assigned_to })
}
