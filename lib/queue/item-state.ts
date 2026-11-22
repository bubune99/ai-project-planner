/**
 * A queue item: something put to the owner (a question, a job paused for him), and what happens after he answers.
 *
 * Before 2026-11-14 an answered question simply became "completed". Nothing recorded that an agent picked the
 * answer up, which agent, or whether the work that followed was done; that evening the owner answered 17 and 10
 * went nowhere without anything showing it.
 *
 * States, kept apart:
 *   waiting     he has not answered
 *   unclaimed   he answered; no agent has picked the answer up
 *   claimed     an agent picked it up and is acting on it
 *   done        the agent finished what the answer called for, and said what it did
 *   set-aside   withdrawn or cancelled
 *
 * Routing: every item records who asked (a stable agent name), where that agent was working (a folder or
 * machine), and the project. The answer belongs to the asker first; after a grace period, or when nobody is
 * recorded as the asker, any agent working on the same project may claim it.
 *
 * Pure: no database, no clock (pass `now`). Checked in item-state.assert.ts. The claim data lives in the row's
 * `metadata` (askedFrom, claimedBy, claimedAt, claimedFrom, doneAt, doneNote); the asker's name is `assigned_to`.
 */

export type ItemState = "waiting" | "unclaimed" | "claimed" | "done" | "set-aside"

export interface ItemRow {
  status: string
  /** The asking agent's name (agent_jobs.assigned_to). */
  askedBy: string | null
  projectId: string | null
  answeredAt: string | null
  metadata: Record<string, unknown> | null
  /**
   * Set when the planner itself carried the answer out, so no agent has anything to pick up: an approved or refused
   * change to a page's plan is applied by the planner. Without this such an answer read "Not picked up yet" forever.
   */
  applied?: { at: string | null; what: string } | null
}

export interface Routing { askedBy: string | null; askedFrom: string | null; projectId: string | null; claimedBy: string | null; claimedAt: string | null; claimedFrom: string | null; doneAt: string | null; doneNote: string | null }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
/** A name nobody chose: the default written when an agent did not say who it was. */
const ANONYMOUS = new Set(["mcp-client", "agent", "unknown", ""])

export function routing(row: ItemRow): Routing {
  const m = row.metadata ?? {}
  const asker = str(row.askedBy)
  return {
    askedBy: asker && !ANONYMOUS.has(asker.toLowerCase()) ? asker : null,
    askedFrom: str(m.askedFrom), projectId: row.projectId,
    claimedBy: str(m.claimedBy), claimedAt: str(m.claimedAt), claimedFrom: str(m.claimedFrom),
    doneAt: str(m.doneAt), doneNote: str(m.doneNote),
  }
}

export function itemState(row: ItemRow): ItemState {
  if (row.status === "awaiting-unlock") return "waiting"
  if (row.status === "cancelled" || row.status === "failed") return "set-aside"
  const r = routing(row)
  if (r.doneAt || row.applied) return "done"
  if (r.claimedBy) return "claimed"
  return "unclaimed"
}

/** What the planner did with a decided change to a page's plan, in a sentence. Null while it is not decided. */
export function planChangeNote(c: { action: string; label: string | null; route: string; status: string }): string | null {
  const name = c.label ? `"${c.label}"` : "The item"
  if (c.status === "approved") return c.action === "remove" ? `${name} is out of the plan for ${c.route}.` : `${name} is in the plan for ${c.route}.`
  if (c.status === "rejected") return `The plan for ${c.route} was left as it was.`
  return null
}

/** How long the asker has an answer to itself before another agent on the project may take it. */
export const CLAIM_GRACE_MINUTES = 20

export type ClaimVerdict = { ok: true; takenOver: boolean } | { ok: false; why: string }

/**
 * May `agent` claim this answer now? The asker always may. Another agent may when it names the same project and
 * either nobody is recorded as the asker or the grace period has passed. A claimed answer is not taken from the
 * agent holding it unless that claim is older than `staleMinutes` and the work was never marked done.
 */
export function mayClaim(row: ItemRow, a: { agent: string; projectId?: string | null; now: number; graceMinutes?: number; staleMinutes?: number }): ClaimVerdict {
  const agent = a.agent.trim()
  if (!agent || ANONYMOUS.has(agent.toLowerCase())) return { ok: false, why: "Say which agent you are (a stable name), so the owner can see who has his answer." }
  const state = itemState(row), r = routing(row)
  if (state === "waiting") return { ok: false, why: "The owner has not answered this yet." }
  if (state === "set-aside") return { ok: false, why: "This item was set aside." }
  if (state === "done") return { ok: false, why: `Already finished${r.claimedBy ? ` by ${r.claimedBy}` : ""}.` }
  const same = (x: string | null) => !!x && x.toLowerCase() === agent.toLowerCase()
  if (state === "claimed") {
    if (same(r.claimedBy)) return { ok: true, takenOver: false }
    const held = r.claimedAt ? (a.now - new Date(r.claimedAt).getTime()) / 60000 : Infinity
    const stale = a.staleMinutes ?? 24 * 60
    if (held < stale) return { ok: false, why: `${r.claimedBy} has this answer and is acting on it.` }
    if (!row.projectId || a.projectId !== row.projectId) return { ok: false, why: `${r.claimedBy} claimed this and went quiet; only an agent working on its project may take it over.` }
    return { ok: true, takenOver: true }
  }
  // unclaimed
  if (same(r.askedBy)) return { ok: true, takenOver: false }
  if (!row.projectId) return r.askedBy ? { ok: false, why: `This answer is for ${r.askedBy} and has no project another agent could claim it through.` } : { ok: true, takenOver: false }
  // No project given is not "a different project" (2026-11-17: an agent handed the answer at session start was told
  // it belonged elsewhere, when it had only left projectId out).
  if (!a.projectId) return { ok: false, why: `Say which project you are working on: pass projectId ${row.projectId}${r.askedBy ? `, or claim it as ${r.askedBy}` : ""}.` }
  if (a.projectId !== row.projectId) return { ok: false, why: "This answer belongs to a different project." }
  if (!r.askedBy) return { ok: true, takenOver: false }
  const waited = row.answeredAt ? (a.now - new Date(row.answeredAt).getTime()) / 60000 : Infinity
  const grace = a.graceMinutes ?? CLAIM_GRACE_MINUTES
  if (waited < grace) return { ok: false, why: `This answer is for ${r.askedBy}. Another agent on the project may take it after ${grace} minutes (${Math.ceil(grace - waited)} to go).` }
  return { ok: true, takenOver: true }
}

/** The metadata after a claim. Never drops what was there. */
export function claimPatch(metadata: Record<string, unknown> | null, a: { agent: string; from?: string | null; now: number }): Record<string, unknown> {
  return { ...(metadata ?? {}), claimedBy: a.agent.trim(), claimedAt: new Date(a.now).toISOString(), ...(a.from ? { claimedFrom: a.from } : {}) }
}

export class QueueError extends Error {}

/** The metadata after the work is finished. A note saying what was done is required: "done" without it is refused. */
export function donePatch(row: ItemRow, a: { agent: string; note: string; now: number }): Record<string, unknown> {
  const state = itemState(row), r = routing(row), note = a.note.replace(/\s+/g, " ").trim()
  if (state === "done") throw new QueueError("This item is already marked finished.")
  if (state !== "claimed") throw new QueueError("Claim the answer first, then mark the work finished.")
  if (!r.claimedBy || r.claimedBy.toLowerCase() !== a.agent.trim().toLowerCase()) throw new QueueError(`${r.claimedBy} holds this answer; only that agent marks it finished.`)
  if (note.length < 20) throw new QueueError("Say what was done with the answer (a sentence), so the owner can see it led somewhere.")
  return { ...(row.metadata ?? {}), doneAt: new Date(a.now).toISOString(), doneNote: note.slice(0, 1000) }
}

/** One line for the owner about where his answer went. */
export function whereItWent(row: ItemRow, now: number): string {
  const state = itemState(row), r = routing(row)
  const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000)); return m < 1 ? "just now" : m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago` }
  if (state === "waiting") return "Waiting on you."
  if (state === "set-aside") return "Set aside."
  if (state === "done" && !r.doneAt && row.applied) return `Carried out by the planner ${ago(row.applied.at)}: ${row.applied.what}`.replace(/\s+/g, " ").trim()
  if (state === "done") return `Finished by ${r.claimedBy ?? "an agent"} ${ago(r.doneAt)}: ${r.doneNote ?? ""}`.trim()
  if (state === "claimed") return `Picked up by ${r.claimedBy} ${ago(r.claimedAt)}. Not finished yet.`
  return `Not picked up yet${r.askedBy ? ` (asked by ${r.askedBy})` : ""}. You answered ${ago(row.answeredAt)}.`
}

/**
 * May the owner take an answer back and choose again? Only while nothing has acted on it: no agent has picked it up
 * and the planner has not carried it out. A paused job he released is already running again, so that is not undone
 * here either. After that point he says what should change, and the agent holding it changes course.
 *
 * Owner, 2026-11-14: "a way to see some of the decision made if I click something wrong should allow me to go back
 * and reverse it because i just did that with one and have no way to go back".
 */
export function mayUndo(row: ItemRow): { ok: true } | { ok: false; why: string } {
  const state = itemState(row), r = routing(row)
  if (state === "waiting") return { ok: false, why: "This has not been answered yet." }
  if (state === "set-aside") return { ok: false, why: "This item was set aside." }
  if (row.applied) return { ok: false, why: "The planner has already carried this out." }
  if (state === "claimed") return { ok: false, why: `${r.claimedBy} has already picked this up. Tell that agent what should change.` }
  if (state === "done") return { ok: false, why: `${r.claimedBy ?? "An agent"} has already finished this.` }
  if (row.status !== "completed") return { ok: false, why: "This released a paused job, which is running again." }
  return { ok: true }
}

/** The metadata after an answer is taken back: keeps what he had said, so the record shows he changed his mind. */
export function undoPatch(metadata: Record<string, unknown> | null, a: { was: string | null; now: number }): Record<string, unknown> {
  const m = metadata ?? {}, before = Array.isArray(m.takenBack) ? (m.takenBack as unknown[]).slice(-9) : []
  return { ...m, takenBack: [...before, { at: new Date(a.now).toISOString(), was: a.was }] }
}

/**
 * The answers a held call wakes for: the unpicked ones the caller has not already been handed. Without this a call
 * returned at once for as long as any answer on the account stayed unpicked (often another project's), so a
 * listener never held and looped until the key's allowance was used up (card 565bf3f6).
 */
export function wakeFor<T extends { questionId: string; state: string }>(items: T[], seen: readonly string[] = []): T[] {
  const known = new Set(seen)
  return items.filter((i) => i.state === "unclaimed" && !known.has(i.questionId))
}
