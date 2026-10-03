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
  const d = new Date(step.end_date)
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
    out.push({ label: `☑ ${done}/${subs.length}`, title: "Subtasks" })
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

export function toKanbanTask(step: BoardStep, opts: AdaptOptions): KanbanTask {
  const isDone = kindOf(step, opts.statusMap) === "done"
  const { due, dueSoon } = toDue(step, isDone, opts.today)

  return {
    id: step.id,
    title: step.title,
    note: step.description ?? undefined,
    priority: toBoardPriority(step.priority),
    // The board's `category` chip is one short label. Our steps carry a tag
    // array, so the first tag stands in and the rest are not shown here —
    // lossy on purpose, rather than crowding the card with every tag.
    category: step.tags?.[0] || undefined,
    // the first tag is already up top as the category chip; show the rest here
    tags: (step.tags ?? []).slice(1).map((label) => ({ label, color: tagColor(label) })),
    assignees: step.assigned_agent ? [{ name: step.assigned_agent }] : undefined,
    due,
    dueSoon,
    progress: toProgress(step, isDone),
    footnotes: toFootnotes(step, opts),
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
