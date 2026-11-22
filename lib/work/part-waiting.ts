/**
 * Shipped, part waiting on the owner (card 2f95e84a): the reads. What it means is decided in lib/work/pipeline.ts
 * (readShipNote, shipOf, partWaiting; pure, asserted). Nothing is stored for it: it is read each time from
 *   agent_jobs      his open questions (status 'awaiting-unlock'), each about a card (parent_step_id) or named by one
 *   step_blockers   the question a blocked card waits on (question_id)
 *   step_comments   the note `gates shipped` leaves on a card (author_label 'gates shipped')
 *   gate_ships      the production ship record for the commit that note names
 *
 * The caller has already checked that `userId` may see every card in `steps`. Only his own questions count, so a
 * collaborator looking at the same board is never told a part waits on him.
 */
import { sql } from "@/lib/db/client"
import { partWaiting, shipOf, SHIP_NOTE_AUTHOR, type OpenHold, type PartWaiting } from "./pipeline"

const iso = (d: string | Date) => new Date(d).toISOString()

/** For the cards given, the ones that are shipped with a part waiting on this user, by card id. */
export async function partWaitingFor(userId: string, steps: { id: string; project_id: string }[]): Promise<Record<string, PartWaiting>> {
  if (!steps.length) return {}
  // His open questions are few (the inbox lists 200 at most); the cards can be thousands, so start from the questions.
  const questions = (await sql`
    SELECT j.id, COALESCE(j.unlock_prompt, j.title) AS text,
           j.parent_step_id AS asked_about,
           (SELECT b.step_id FROM step_blockers b WHERE b.question_id = j.id AND b.resolved_at IS NULL LIMIT 1) AS named_by
      FROM agent_jobs j
     WHERE j.status = 'awaiting-unlock' AND j.created_by = ${userId}
     ORDER BY j.created_at
     LIMIT 200
  `) as { id: string; text: string | null; asked_about: string | null; named_by: string | null }[]
  const onBoard = new Set(steps.map((s) => s.id))
  const byCard = new Map<string, { id: string; text: string }[]>()
  for (const q of questions) {
    // The card it was asked about, and the blocked card that names it (usually the same one).
    for (const card of new Set([q.asked_about, q.named_by])) {
      if (!card || !onBoard.has(card)) continue
      byCard.set(card, [...(byCard.get(card) ?? []), { id: q.id, text: String(q.text ?? "").trim() || "A question in your inbox" }])
    }
  }
  const ids = [...byCard.keys()]
  if (!ids.length) return {}

  const notes = (await sql`
    SELECT step_id, author_label, body, created_at FROM step_comments
     WHERE step_id = ANY(${ids}::uuid[]) AND author_label = ${SHIP_NOTE_AUTHOR} AND deleted_at IS NULL
  `) as { step_id: string; author_label: string | null; body: string; created_at: string | Date }[]
  if (!notes.length) return {}
  const cards = (await sql`
    SELECT s.id, s.project_id, s.status, step_status_kind(s.project_id, s.status) AS kind,
           b.id AS blocker_id, b.question_id, b.waiting_on, b.depends_on_step_id
      FROM project_steps s
      LEFT JOIN step_blockers b ON b.step_id = s.id AND b.resolved_at IS NULL
     WHERE s.id = ANY(${notes.map((n) => n.step_id)}::uuid[]) AND s.deleted_at IS NULL
  `) as { id: string; project_id: string; status: string; kind: string | null; blocker_id: string | null; question_id: string | null; waiting_on: string | null; depends_on_step_id: string | null }[]
  if (!cards.length) return {}
  const ships = (await sql`
    SELECT project_id, sha, shipped_at FROM gate_ships
     WHERE env = 'production' AND project_id = ANY(${[...new Set(cards.map((c) => c.project_id))]}::uuid[])
     ORDER BY shipped_at DESC
     LIMIT 2000
  `) as { project_id: string; sha: string; shipped_at: string | Date }[]

  const out: Record<string, PartWaiting> = {}
  for (const c of cards) {
    const ship = shipOf(
      notes.filter((n) => n.step_id === c.id).map((n) => ({ authorLabel: n.author_label, body: n.body, at: iso(n.created_at) })),
      ships.filter((s) => s.project_id === c.project_id).map((s) => ({ sha: s.sha, at: iso(s.shipped_at) })),
    )
    const hold: OpenHold | null = c.blocker_id ? { questionId: c.question_id, waitingOn: c.waiting_on ?? "unknown", dependsOnCard: !!c.depends_on_step_id } : null
    const w = partWaiting({ status: c.status, kind: c.kind ?? "open" }, hold, byCard.get(c.id) ?? [], ship)
    if (w) out[c.id] = w
  }
  return out
}

/**
 * The same cards with `part_waiting` set on each (null when it does not apply). A failure here is logged and the
 * cards are returned as they were: the board must still load, and a card then shows the column it is really in.
 */
export async function withPartWaiting<T extends { id: string; project_id: string }>(userId: string, steps: T[]): Promise<(T & { part_waiting?: PartWaiting | null })[]> {
  try {
    const map = await partWaitingFor(userId, steps)
    return steps.map((s) => ({ ...s, part_waiting: map[s.id] ?? null }))
  } catch (error) {
    console.error("part-waiting lookup failed", error)
    return steps
  }
}
