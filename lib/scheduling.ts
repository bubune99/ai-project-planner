/**
 * Scheduling rules for project steps — pure, no React, no DOM.
 *
 * These lived inside GanttView.tsx and StepFormModal.tsx, where they could not
 * be executed in isolation: a .tsx module in this (CJS) Next.js project cannot
 * be ESM-imported by a test harness, so its named exports are invisible. Pulled
 * out here so every rule below can be run against real inputs without a dev
 * server, a build, or a browser.
 *
 * The rule that matters: a step is on the timeline only if it carries a real
 * date. GanttView used to invent one (start = 1st of the current month +
 * index*3 days, end = start + 7 days) for every undated step, so 414 of 477
 * bars described nothing.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface DatedStep {
  start_date?: string | Date | null
  end_date?: string | Date | null
}

/**
 * True when a step has at least one real date and therefore belongs on the
 * timeline. Empty strings are not dates. A missing step is not scheduled
 * rather than an error — callers filter lists, they don't validate.
 */
export function isScheduled(step: DatedStep | null | undefined): boolean {
  return Boolean(step?.start_date || step?.end_date)
}

/**
 * The bar span for a SCHEDULED step. One real date is enough: it anchors the
 * bar and the missing side is a week away. That is interpolation around a
 * fact, unlike the old fabrication from nothing.
 *
 * Returns null for an unscheduled step — the caller must not draw it.
 */
export function barDates(step: DatedStep | null | undefined): { start: Date; end: Date } | null {
  if (!isScheduled(step)) return null
  const s = step!.start_date ? new Date(step!.start_date as string) : null
  const e = step!.end_date ? new Date(step!.end_date as string) : null
  if (s && e) return { start: s, end: e }
  if (e) return { start: new Date(e.getTime() - WEEK_MS), end: e }
  return { start: s as Date, end: new Date((s as Date).getTime() + WEEK_MS) }
}

/**
 * Dates to write when someone gives an unscheduled step a due date.
 *
 * `today` is injected rather than read from the clock so the behaviour is
 * verifiable. A due date in the past collapses start onto the due date instead
 * of drawing a bar that runs backwards from today.
 */
export function scheduleFromDueDate(
  due: string,
  today: Date = new Date(),
): { start_date: string; end_date: string } | null {
  if (!due) return null
  const end = new Date(`${due}T12:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const start = end.getTime() < today.getTime() ? end : today
  return { start_date: start.toISOString(), end_date: end.toISOString() }
}

/** A Date, ISO string, or null -> the yyyy-mm-dd an <input type="date"> wants. */
export function toDateInput(v: unknown): string {
  if (!v) return ""
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

/**
 * Phases in this schema are words ('ideation', 'construction', 'imported').
 * GanttView ran parseInt over them, which always yielded NaN -> 1, collapsing
 * every step into a single "Phase 1" group.
 */
export function phaseLabel(phase: unknown): string {
  return (typeof phase === "string" && phase.trim()) || "Unphased"
}
