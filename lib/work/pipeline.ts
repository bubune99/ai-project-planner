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
export type Kind = "task" | "initiative" | "upkeep"
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
  return kind !== "initiative" && GO.has(to) && !GO.has(from ?? "")
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
export function jobFor(r: WorkRow, projectId: string, startNow: boolean) {
  return {
    title: `Work: ${r.title}`.slice(0, 250),
    description: `${startNow ? "The owner moved this card to In progress: start it now." : "The owner moved this card to Up next."} Claim it (it then shows you as holding it), do it, and finish with proof, or put it back with a note on where it stands. Card ${r.id}.${r.description ? `\n\n${r.description.slice(0, 1200)}` : ""}`,
    priority: startNow ? "high" as const : PRIORITY_JOB[r.priority ?? "medium"] ?? "normal",
    input: { projectId, kind: "work", stepId: r.id },
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
