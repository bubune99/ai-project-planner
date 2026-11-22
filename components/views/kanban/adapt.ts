/**
 * BoardStep -> KanbanTask/KanbanColumn.
 *
 * Pure: no React, no DOM, and `today` is injected rather than read from the
 * clock, so every rule below can be executed against real inputs without a
 * dev server or a render tree. Same reasoning as lib/scheduling.ts.
 *
 * The board component this feeds was adopted from the 21st.dev registry and
 * speaks a slightly different dialect than our schema does. The translation
 * is small but it is not identity, and the places it is lossy are called out.
 */

import { holding, type WorkRow } from "@/lib/work/pipeline"
import type { BoardStep, StepPriority } from "@/lib/types"
import type { ColumnDef, ProjectStatus, StatusKind } from "../kanban-config"
import { normalizeChecklist, tagColor } from "../kanban-config"
import type { KanbanColumn, KanbanTask, Priority } from "./KanbanBoard"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Our schema says `medium`; the board says `normal`. Everything else lines up,
 * including `urgent`, which migration 056 added to project_steps.priority.
 */
export function toBoardPriority(p: StepPriority | null | undefined): Priority | undefined {
  if (!p) return undefined
  switch (p) {
    case "urgent":
      return "urgent"
    case "high":
      return "high"
    case "medium":
      return "normal"
    case "low":
      return "low"
    default:
      return undefined
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * The date shown on a card, and whether to paint it amber.
 *
 * Amber means "needs attention": today, tomorrow, or already past. A step that
 * is done is never amber however old it is — a finished task is not a problem.
 * An undated step returns {} and the card simply omits the row, which is what
 * keeps undated work off the timeline rather than inventing a date for it.
 */
export function toDue(
  step: Pick<BoardStep, "end_date">,
  isDone: boolean,
  today: Date = new Date(),
): { due?: string; dueSoon?: boolean } {
  if (!step.end_date) return {}
  // A due date is a calendar day: Postgres returns "2026-11-18T00:00:00Z",
  // which local time west of UTC reads as Nov 17. Use the date part.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(step.end_date)
  const d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3], 12) : new Date(step.end_date)
  if (Number.isNaN(d.getTime())) return {}

  const day = startOfDay(d)
  const now = startOfDay(today)

  let due: string
  if (day === now) due = "Today"
  else if (day === now + DAY_MS) due = "Tomorrow"
  else {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    due = `${months[d.getMonth()]} ${d.getDate()}`
  }

  return { due, dueSoon: !isDone && day <= now + DAY_MS }
}

/**
 * Progress for the ring.
 *
 * A done step reads 100 even if nobody updated the number, because the status
 * is the stronger signal — this mirrors what migration 056 did to
 * update_project_progress(), which counts done-kind steps as 100.
 */
export function toProgress(step: Pick<BoardStep, "progress">, isDone: boolean): number | undefined {
  if (isDone) return 100
  if (typeof step.progress !== "number" || Number.isNaN(step.progress)) return undefined
  return Math.max(0, Math.min(100, Math.round(step.progress)))
}

export interface AdaptOptions {
  /** project_statuses keyed by status key, for resolving done-ness. */
  statusMap: Record<string, ProjectStatus>
  today?: Date
  /** Subtasks of a step, so the card can show a done/total counter. */
  subtasksOf?: (stepId: string) => BoardStep[]
  /** On the all-projects board each card names its project first (owner, 2026-11-16: "tasks need to have tags or be identified to the project that they belong to"). */
  showProject?: boolean
}

function hours(v: BoardStep["estimated_hours"]): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : v
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * The small counters in the card footer.
 *
 * Each one is omitted entirely when it has nothing to say — a card with no
 * subtasks should not carry an empty subtask counter. This is what keeps the
 * footer from turning back into the eleven-badge row it replaced.
 */
/** A card's subtasks for showing in place (owner's pick 2026-11-17): title and whether each is done. */
export function toSubtaskList(step: BoardStep, opts: AdaptOptions): Array<{ id: string; title: string; done: boolean }> {
  return (opts.subtasksOf?.(step.id) ?? []).map((s) => ({ id: s.id, title: s.title, done: kindOf(s, opts.statusMap) === "done" }))
}

export function toFootnotes(
  step: BoardStep,
  opts: AdaptOptions,
): Array<{ label: string; title?: string }> {
  const out: Array<{ label: string; title?: string }> = []

  const est = hours(step.estimated_hours)
  if (est > 0) out.push({ label: `${est}h`, title: "Estimated hours" })

  const subs = opts.subtasksOf?.(step.id) ?? []
  if (subs.length > 0) {
    const done = subs.filter((s) => kindOf(s, opts.statusMap) === "done").length
    out.push({ label: `${done}/${subs.length} subtasks`, title: "Subtasks" })
  }

  const checklist = normalizeChecklist(step.tasks)
  if (checklist.length > 0) {
    const done = checklist.filter((c) => c.done).length
    out.push({ label: `✓ ${done}/${checklist.length}`, title: "Checklist" })
  }

  const deps = Array.isArray(step.dependencies) ? step.dependencies.length : 0
  if (deps > 0) out.push({ label: `⇄ ${deps}`, title: "Dependencies" })

  return out
}

function kindOf(step: Pick<BoardStep, "status">, statusMap: Record<string, ProjectStatus>): StatusKind {
  return statusMap[step.status]?.kind ?? "open"
}

const INITIATIVE_WORD = { campaign: "Campaign", phase: "Phase", sprint: "Sprint" } as const
/** Who has the card, in words for its footer: the agent holding it, or that it was sent and not picked up (lib/work/pipeline.ts). */
export function holderLine(step: BoardStep, now: Date, done = false): { label: string; title: string } | null {
  const h = holding(step as unknown as WorkRow, now)
  if (h?.state === "held") return { label: `With ${h.by}`, title: "The agent working on it now" }
  if (h?.state === "sent") return { label: "Sent, waiting for an agent", title: "Sent to the project's agents; it shows who has it once one picks it up" }
  if (h?.state === "nobody") return { label: "Nobody holds it", title: "In progress with no agent holding it: agents put it back" }
  // Started from Up next: it stays in Up next until an agent takes it, so the card itself says it is in line
  // (walk 2026-11-17: after the toast faded nothing showed that Start had worked).
  // A finished card is never in line, even when a job for it was left open.
  if (!done && (step as BoardStep & { in_line?: boolean }).in_line) return { label: "In line for an agent", title: "Started: sent to the project's agents; it moves to In Progress when one takes it" }
  return null
}

/** Who made the card (owner, 2026-11-19: "each card shows who made it"). Nothing for cards made before it was recorded. */
export function authorLine(step: BoardStep): { label: string; title: string } | null {
  const by = (step as BoardStep & { created_by?: string | null }).created_by?.trim()
  if (!by) return null
  return by === "owner" ? { label: "By you", title: "You made this card" } : { label: `By ${by}`, title: "The agent that made this card" }
}

/** Why a closed card will not be done, from metadata.closed (owner, 2026-11-19). */
export function closedLine(step: BoardStep): { label: string; title: string } | null {
  if (step.status !== "closed") return null
  const why = ((step.metadata as { closed?: { why?: string } } | null)?.closed?.why ?? "").trim()
  if (!why) return { label: "Closed", title: "Closed with no reason recorded" }
  return { label: `Closed: ${why.length > 60 ? `${why.slice(0, 57)}...` : why}`, title: why }
}

/**
 * Shipped, with a part waiting on the owner (card 2f95e84a): the words for the card, and the question behind them.
 * The list routes work it out (lib/work/pipeline.ts partWaiting); the card stays in the column it is really in.
 */
export function standingLine(step: BoardStep): { label: string; title: string } | null {
  const w = step.part_waiting
  return w ? { label: w.label, title: `It is live. Waiting on your answer: ${w.question}` } : null
}

export function toKanbanTask(step: BoardStep, opts: AdaptOptions): KanbanTask {
  const isDone = kindOf(step, opts.statusMap) === "done"
  const workKind = (step as BoardStep & { work_kind?: string }).work_kind
  const initiativeType = ((step.metadata as { work?: { type?: keyof typeof INITIATIVE_WORD } } | null)?.work?.type) ?? "phase"
  const { due, dueSoon } = toDue(step, isDone, opts.today)

  return {
    id: step.id,
    title: step.title,
    note: step.description ?? undefined,
    priority: toBoardPriority(step.priority),
    // The board's `category` chip is one short label. Our steps carry a tag
    // array, so the first tag stands in and the rest are not shown here —
    // lossy on purpose, rather than crowding the card with every tag.
    // A card that is an initiative or upkeep says so first; otherwise its first tag.
    category: workKind === "initiative" ? INITIATIVE_WORD[initiativeType] : workKind === "upkeep" ? "Upkeep" : workKind === "owner" ? "Needs you" : step.tags?.[0] || undefined,
    // The kind is drawn on the card (the category above never was): owner, 2026-11-16, umbrellas become initiatives.
    kind: workKind === "initiative" ? INITIATIVE_WORD[initiativeType] : workKind === "upkeep" ? "Upkeep" : workKind === "owner" ? "Needs you" : undefined,
    // the first tag is already up top as the category chip; show the rest here
    tags: (step.tags ?? []).slice(1).map((label) => ({ label, color: tagColor(label) })),
    assignees: step.status === "in-progress" && step.claimed_by_id ? [{ name: step.claimed_by_id }] : step.assigned_agent ? [{ name: step.assigned_agent }] : undefined,
    due,
    dueSoon,
    progress: toProgress(step, isDone),
    footnotes: [...(opts.showProject ? [{ label: (step as BoardStep & { project_name?: string }).project_name ?? "Project", title: "The project this card belongs to" }] : []), ...(holderLine(step, opts.today ?? new Date(), isDone) ? [holderLine(step, opts.today ?? new Date(), isDone)!] : []), ...[closedLine(step), authorLine(step)].filter((x): x is { label: string; title: string } => x !== null), ...toFootnotes(step, opts)],
    subtasks: toSubtaskList(step, opts),
    standing: standingLine(step) ?? undefined,
    done: isDone,
  }
}

/**
 * Build the board from the column definitions we already compute in
 * kanban-config (columnsFor/groupKeyOf/sortSteps stay the source of truth for
 * grouping — this only reshapes the result).
 */
export function toKanbanColumns(
  columns: ColumnDef[],
  stepsFor: (columnKey: string) => BoardStep[],
  opts: AdaptOptions,
): KanbanColumn[] {
  return columns.map((col) => ({
    id: col.key,
    name: col.label,
    accentHex: col.colorHex,
    tasks: stepsFor(col.key).map((s) => toKanbanTask(s, opts)),
  }))
}
