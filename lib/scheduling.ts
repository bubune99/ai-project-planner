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

/* ───────────────────────── timeline geometry ─────────────────────────────
 *
 * Bar placement and the date header used to live inline in GanttTimeline as
 * percentage arithmetic, which meant it could only be checked by looking at
 * the chart. Pulled out here for the same reason the rules above were: a
 * timeline that puts a bar in the wrong place is not something a type checker
 * or a DOM query will tell you about, but it is trivially assertable once the
 * maths is a function.
 *
 * Everything is expressed in percentages of the visible range so the chart
 * stays fluid; `today` is injected rather than read from the clock.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from `start` to `end`, inclusive of both ends. Never below 1. */
export function dayCount(start: Date, end: Date): number {
  const s = startOfDayMs(start)
  const e = startOfDayMs(end)
  return Math.max(1, Math.round((e - s) / DAY_MS) + 1)
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Where a bar sits in the range, as left/width percentages.
 *
 * A bar is clamped to the range rather than dropped: a step that began before
 * the window still reads as "running" at the left edge, which is true, where
 * hiding it would imply there is no work there. Returns null only when the bar
 * lies entirely outside the window.
 */
export function barRect(
  bar: { start: Date; end: Date },
  rangeStart: Date,
  rangeEnd: Date,
): { leftPct: number; widthPct: number } | null {
  const total = dayCount(rangeStart, rangeEnd)
  const s0 = startOfDayMs(rangeStart)
  const barS = startOfDayMs(bar.start)
  const barE = startOfDayMs(bar.end)
  if (barE < s0) return null
  if (barS > startOfDayMs(rangeEnd)) return null

  const offsetDays = Math.max(0, Math.round((barS - s0) / DAY_MS))
  const endDays = Math.min(total - 1, Math.round((barE - s0) / DAY_MS))
  const spanDays = Math.max(1, endDays - offsetDays + 1)

  return {
    leftPct: (offsetDays / total) * 100,
    widthPct: (spanDays / total) * 100,
  }
}

/** Percentage position of today, or null when it falls outside the range. */
export function todayPct(rangeStart: Date, rangeEnd: Date, today: Date = new Date()): number | null {
  const t = startOfDayMs(today)
  const s = startOfDayMs(rangeStart)
  const e = startOfDayMs(rangeEnd)
  if (t < s || t > e) return null
  const total = dayCount(rangeStart, rangeEnd)
  // centre the marker in today's column rather than on its leading edge
  return ((Math.round((t - s) / DAY_MS) + 0.5) / total) * 100
}

export interface TimelineTick {
  key: string
  label: string
  leftPct: number
  widthPct: number
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * The lower header row: one tick per day.
 *
 * Returned rather than rendered so the caller can decide how many to label —
 * a year-long range produces 365 of these and labelling all of them is
 * unreadable, which is a presentation choice, not a geometry one.
 */
export function dayTicks(rangeStart: Date, rangeEnd: Date): TimelineTick[] {
  const total = dayCount(rangeStart, rangeEnd)
  const width = 100 / total
  const out: TimelineTick[] = []
  for (let i = 0; i < total; i++) {
    const d = new Date(startOfDayMs(rangeStart) + i * DAY_MS)
    out.push({
      key: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      leftPct: i * width,
      widthPct: width,
    })
  }
  return out
}

/**
 * The upper header row: one band per calendar month the range touches.
 *
 * Bands are clipped to the range, so a range starting mid-month yields a
 * narrow first band rather than one hanging off the left edge. This is the
 * band that tells you *when* you are looking at — the day numbers below it
 * repeat every month and mean nothing on their own.
 */
export function monthBands(rangeStart: Date, rangeEnd: Date): TimelineTick[] {
  const total = dayCount(rangeStart, rangeEnd)
  const s0 = startOfDayMs(rangeStart)
  const out: TimelineTick[] = []

  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  const last = startOfDayMs(rangeEnd)

  while (startOfDayMs(cursor) <= last) {
    const monthStart = startOfDayMs(cursor)
    const monthEnd = startOfDayMs(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

    const from = Math.max(monthStart, s0)
    const to = Math.min(monthEnd, last)
    const offsetDays = Math.round((from - s0) / DAY_MS)
    const spanDays = Math.round((to - from) / DAY_MS) + 1

    if (spanDays > 0) {
      out.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
        label: `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`,
        leftPct: (offsetDays / total) * 100,
        widthPct: (spanDays / total) * 100,
      })
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return out
}

/**
 * Aggregate progress for a phase row, weighted by nothing — a plain mean of
 * its steps. Returns null for an empty phase so the caller omits the rollup
 * rather than drawing a confident 0%.
 */
export function rollupProgress(steps: Array<{ progress?: number | null }>): number | null {
  if (!steps.length) return null
  const vals = steps.map((s) => (typeof s.progress === "number" && !Number.isNaN(s.progress) ? s.progress : 0))
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
