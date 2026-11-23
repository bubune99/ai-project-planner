/**
 * One board for the owner and the agents: what a card is, where it stands, and when moving it sends it to an agent.
 *
 * Owner, 2026-11-16: "It feels like you and the agents have a separate task list that you abide by than the one that I
 * see in the UI and that is wrong. I should be able to see all the things that you have to do with clear deliverables
 * and action states ... a card for all of your maintenance and upkeep items and be able to drag things in which should
 * be able to kick you and any of the other agents off to start working". Also: "In progress should be that we moved it
 * there and you have finished or are working on it. There should never be anything stale in in progress", and on
 * initiatives: "campaigns or starting certain phases or sprints ... some tasks really do need to get broken down into
 * actionable steps but we need a good way to see that".
 *
 * A card's kind (project_steps.work_kind, migration 071): task, initiative (a campaign, phase or sprint holding tasks),
 * upkeep (an agent's maintenance: cleanup, records, checks). Its column is its status:
 *   requested    to build eventually; nobody works on it yet
 *   pending      up next: an agent is sent it and picks it up
 *   in-progress  an agent holds it now (claimed), or it was just sent and is waiting to be picked up
 *   blocked      waiting on something, usually the owner
 *   completed    done, with proof
 * The owner's own actions stay on their to-do list. Pure; checked in pipeline.assert.ts.
 */
/** owner (migration 075): only the owner can do it (keys, dashboards, accounts, payments); never sent to an agent. */
export type Kind = "task" | "initiative" | "upkeep" | "owner"
export type InitiativeType = "campaign" | "phase" | "sprint"
export interface WorkRow {
  id: string; title: string; status: string; priority?: string | null; parent_task_id?: string | null; order_index?: number | null
  description?: string | null; work_kind?: Kind | null
  claimed_by_id?: string | null; claimed_at?: string | null; last_check_in_at?: string | null
  metadata?: { work?: { type?: InitiativeType; starts?: string; ends?: string; sentAt?: string; jobId?: string } } | null
}

export const kindOf = (r: WorkRow): Kind => r.work_kind ?? "task"
export const isDone = (r: WorkRow) => r.status === "completed" || r.status === "done"

/** Columns that mean "go": landing in one of these from anywhere else sends the card to an agent. */
const GO = new Set(["pending", "in-progress"])
/** Does moving a card from one column to another send it to an agent? Initiatives are never sent; their tasks are. */
export function sendsOnMove(from: string | null, to: string, kind: Kind): boolean {
  return kind !== "initiative" && kind !== "owner" && GO.has(to) && !GO.has(from ?? "")
}

/** Columns that take a card off the agents' line: pulled back to Requests, paused, finished or closed. */
const OFF_THE_LINE = new Set(["requested", "paused", "completed", "done", "closed"])
/**
 * Does moving a card withdraw the job it was sent with? Only a job nobody has picked up yet is withdrawn (the caller
 * cancels pending ones only); an agent holding the card finishes or hands it back itself. Found 2026-11-23: on
 * production 17 jobs were still waiting, two for closed cards and two for cards moved back to Requests.
 */
export function withdrawsOnMove(from: string | null, to: string): boolean {
  return from !== to && OFF_THE_LINE.has(to)
}

/*
  Start, in the owner's words (inbox be28f3e9, 2026-11-16): "Agents can get swapped. So it gets put on the ready for when
  an agent becomes available to take over and get things moving. If an agent is connected it gets added to the queue to
  really run through." Start puts the card in Up next (the ready line) and sends it to the project's agents; the card
  moves to In Progress only when an agent takes it. It never makes an In Progress card that nobody holds.
*/
export type StartMove = { to: "pending" | null; send: boolean; why?: string }
export function startMove(r: WorkRow): StartMove {
  if (kindOf(r) === "initiative") return { to: null, send: false, why: "Start one of its tasks; an initiative is never sent itself." }
  if (kindOf(r) === "owner") return { to: null, send: false, why: "Only you can do this one, so it is not sent to an agent. It is listed under Waiting on you." }
  if (isDone(r)) return { to: null, send: false, why: "It is finished. Reopen it first." }
  if (r.status === "in-progress") return { to: null, send: false, why: r.claimed_by_id ? `${r.claimed_by_id} is already working on it.` : "It is already with an agent." }
  return { to: r.status === "pending" ? null : "pending", send: true }
}

/*
  A question the owner has to answer holds its card (card f473b5d4). The questions and the work they hold up lived
  apart: nine cards sat in progress with nobody on them while their questions waited in the inbox. Asking about a card
  now blocks it and the card's blocker record names the question; his answer returns it to Up next.
*/
/** The card's open blocker record (step_blockers), as far as a question cares. */
export interface OpenHold { questionId: string | null; waitingOn: string; dependsOnCard: boolean }
/**
 * What asking the owner about a card does to it. `kind` is the status's kind (done, closed, active, open).
 *   block     move it to Blocked, waiting on the owner, naming the question
 *   remember  it is already blocked waiting on the owner with no question named: name this one, keep its reason
 *   null      leave it: finished or closed, or blocked for a reason of its own
 */
export function whenQuestionAsked(card: { status: string; kind: string }, hold: OpenHold | null): "block" | "remember" | null {
  if (card.status === "blocked") return hold && hold.waitingOn === "owner" && !hold.questionId && !hold.dependsOnCard ? "remember" : null
  if (card.kind === "done" || card.kind === "closed") return null
  return "block"
}
/**
 * What the owner's answer does to the card. Only a card still blocked on this very question moves: one he finished,
 * moved, or that was blocked again for another reason stays where it is. While another question about the same card
 * is still open (`othersOpen`, oldest first) the card stays blocked and names that one instead.
 */
export function whenQuestionAnswered(status: string, hold: OpenHold | null, questionId: string, othersOpen: string[]): { to: "pending" } | { holdFor: string } | null {
  if (status !== "blocked" || !hold || hold.questionId !== questionId) return null
  return othersOpen.length ? { holdFor: othersOpen[0] } : { to: "pending" }
}

/*
  Shipped, part waiting on the owner (card 2f95e84a). A card whose work is live but where one part needs his answer
  could only be shown as Blocked (which hid that it shipped) or Complete (which hid that he owes an answer). It is
  not a column and nobody types it: it is read from two records the card already has. `gates shipped` writes a note
  on each card a production ship finishes or moves on (step_comments, author "gates shipped"), and the commit it names
  has a production ship record (gate_ships); and a question in his inbox is open about the card.
*/
export const SHIP_NOTE_AUTHOR = "gates shipped"
/** The two notes a production ship leaves on a card. Staging notes start with other words and are never a ship. */
const SHIP_NOTE = /^(?:Done and live|Moved on): (\S+)@([0-9a-f]{7,40}) on (\S+?)\. Seen: /i
export interface ShipNote { sha: string; repo: string; target: string; /** What the ship said is still to do, when it moved the card on. */ left: string | null }
/** What a comment on a card says shipped to production, or null when it is not such a note. */
export function readShipNote(authorLabel: string | null | undefined, body: string | null | undefined): ShipNote | null {
  if (authorLabel !== SHIP_NOTE_AUTHOR) return null
  const text = String(body ?? "").trim(), m = SHIP_NOTE.exec(text)
  if (!m) return null
  const left = /\. Still to do: ([\s\S]+)$/.exec(text)?.[1].trim() || null
  return { sha: m[2].toLowerCase(), repo: m[1], target: m[3], left }
}

export interface CardShip extends ShipNote { /** When the ship record says it went live. */ at: string }
const sameCommit = (a: string, b: string) => a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a))
/**
 * The card's newest ship: a note from `gates shipped` whose commit has a production ship record. A note alone is a
 * comment; a ship record alone names no card.
 */
export function shipOf(notes: { authorLabel: string | null; body: string; at: string }[], recorded: { sha: string; at: string }[]): CardShip | null {
  const newestFirst = [...notes].sort((a, b) => b.at.localeCompare(a.at))
  for (const n of newestFirst) {
    const note = readShipNote(n.authorLabel, n.body)
    const rec = note && recorded.find((r) => sameCommit(String(r.sha).toLowerCase(), note.sha))
    if (note && rec) return { ...note, at: rec.at }
  }
  return null
}

export const PART_WAITING = "Shipped, part waiting on you"
export interface PartWaiting { label: string; questionId: string; question: string; ship: CardShip }
/**
 * Is this card shipped with a part still waiting on the owner? `openQuestions` are his unanswered questions about
 * the card, oldest first.
 *   blocked   the question its blocker names must be one of them (that is the one shown)
 *   finished  any open question about it (the oldest is shown)
 * Anything else follows the rules above: no ship is plain Blocked, an answered question returns the card to Up next,
 * a card blocked on another card or with no question named says its own reason.
 */
export function partWaiting(card: { status: string; kind: string }, hold: OpenHold | null, openQuestions: { id: string; text: string }[], ship: CardShip | null): PartWaiting | null {
  if (!ship) return null
  const q = card.status === "blocked"
    ? (hold && hold.waitingOn === "owner" && hold.questionId ? openQuestions.find((x) => x.id === hold.questionId) : undefined)
    : card.kind === "done" ? openQuestions[0] : undefined
  return q ? { label: PART_WAITING, questionId: q.id, question: q.text, ship } : null
}

/** How long a card may sit in progress, sent but not picked up, before it is shown as a fault. */
export const PICKUP_MINUTES = 30
export type Holding = { state: "held"; by: string; since: string | null } | { state: "sent"; since: string } | { state: "nobody" }
/** Who has an in-progress card. */
export function holding(r: WorkRow, now: Date): Holding | null {
  if (r.status !== "in-progress") return null
  if (r.claimed_by_id) return { state: "held", by: r.claimed_by_id, since: r.claimed_at ?? null }
  const sent = r.metadata?.work?.sentAt
  if (sent && now.getTime() - new Date(sent).getTime() < PICKUP_MINUTES * 60_000) return { state: "sent", since: sent }
  return { state: "nobody" }
}

/** What is wrong with how a card is marked. Fixed by agents, never put to the owner. */
export function faultOf(r: WorkRow, now: Date): string | null {
  if (r.status === "in-progress" && kindOf(r) === "initiative") return "An initiative is never in progress itself; its tasks are."
  if (holding(r, now)?.state === "nobody") return "In progress, but no agent holds it."
  return null
}

const PRIORITY_JOB: Record<string, "low" | "normal" | "high" | "critical"> = { low: "low", medium: "normal", high: "high", urgent: "critical" }
/** The job that wakes the project's agents for a card. The finish hook and the listener hand it to the bound session. */
export function jobFor(r: WorkRow, projectId: string, startNow: boolean, projectName?: string) {
  // The project is named, not only its id: the owner wants every card to say which project it belongs to.
  return {
    title: `Work${projectName ? ` (${projectName})` : ""}: ${r.title}`.slice(0, 250),
    description: `${projectName ? `Project: ${projectName}. ` : ""}${startNow ? "The owner moved this card to In progress: start it now." : "The owner moved this card to Up next."} Claim it (it then shows you as holding it), do it, and finish with proof, or put it back with a note on where it stands. Card ${r.id}.${r.description ? `\n\n${r.description.slice(0, 1200)}` : ""}`,
    priority: startNow ? "high" as const : PRIORITY_JOB[r.priority ?? "medium"] ?? "normal",
    input: { projectId, ...(projectName ? { projectName } : {}), kind: "work", stepId: r.id },
    tags: ["work"],
    parentStepId: r.id,
  }
}

export interface Rollup { tasks: number; done: number; working: number; steps: number; stepsDone: number; type: InitiativeType; starts?: string; ends?: string }
/**
 * An initiative's progress, counted from what can actually be done: a task broken into steps counts its steps, a task
 * that is not counts itself.
 */
export function rollup(init: WorkRow, rows: WorkRow[]): Rollup {
  const kids = (id: string) => rows.filter((r) => r.parent_task_id === id && r.status !== "requested")
  const tasks = kids(init.id)
  let steps = 0, stepsDone = 0
  for (const t of tasks) {
    const s = kids(t.id)
    if (s.length) { steps += s.length; stepsDone += s.filter(isDone).length } else { steps += 1; stepsDone += isDone(t) ? 1 : 0 }
  }
  const w = init.metadata?.work ?? {}
  return { tasks: tasks.length, done: tasks.filter(isDone).length, working: tasks.filter((t) => t.status === "in-progress" && !!t.claimed_by_id).length, steps, stepsDone, type: w.type ?? "phase", ...(w.starts ? { starts: w.starts } : {}), ...(w.ends ? { ends: w.ends } : {}) }
}
