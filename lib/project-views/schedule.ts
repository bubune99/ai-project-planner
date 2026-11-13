/**
 * Calendar and plan-mode rules for a project's steps and todos.
 * Pure: no React, no DOM, no clock (pass `today`). Checked by schedule.assert.ts.
 *
 * Owner rule: never invent dates. An item with no start and no due date is
 * unscheduled; it never gets a made-up span.
 */

export const DAY = 86_400_000

export interface Plannable {
  id: string
  title: string
  status?: string | null
  priority?: string | null
  start_date?: string | null
  end_date?: string | null
  dueDate?: string | null
  metadata?: { original_due_date?: string | null } | null
}

/** A local, unsaved schedule: ISO dates (YYYY-MM-DD). `due` may be empty until chosen. */
export interface PlannedRange { start: string; due: string }

export interface Range { start: Date; end: Date }

/** Parse a date or ISO string to local noon, so DST shifts never move it a day. */
export function dayOf(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const s = typeof v === "string" ? v : v.toISOString()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m && typeof v === "string" && s.length <= 10) return new Date(+m[1], +m[2] - 1, +m[3], 12)
  const d = new Date(v)
  if (Number.isNaN(+d)) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** The real range of an item: planned (unsaved) wins, then start/end, then the original due date. */
export function rangeOf(x: Plannable, planned?: PlannedRange): Range | null {
  if (planned) {
    const s = dayOf(planned.start)
    if (!s) return null
    const e = dayOf(planned.due) || s
    return { start: s, end: e < s ? s : e }
  }
  const s = dayOf(x.start_date)
  const e = dayOf(x.end_date) || dayOf(x.dueDate) || dayOf(x.metadata?.original_due_date)
  if (!s && !e) return null
  const start = s || e!
  const end = e || s!
  return end < start ? { start: end, end: start } : { start, end }
}

/** 6 weeks of days starting on the Sunday on or before the 1st of the month. */
export function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1, 12)
  const out: Date[] = []
  for (let i = 0; i < 42; i++) out.push(new Date(year, month, 1 - first.getDay() + i, 12))
  return out
}

export interface DayEntry<T> { item: T; kind: "step" | "todo"; first: boolean; last: boolean; planned: boolean }

/**
 * Place every dated item on each day of its range (capped at 120 days, so a
 * bad year-long range can't flood the grid). `first` marks where a bar starts
 * or restarts on a new week row; `last` marks its final day.
 */
export function byDay<T extends Plannable>(
  items: { item: T; kind: "step" | "todo" }[],
  planned: Record<string, PlannedRange>,
): Map<string, DayEntry<T>[]> {
  const map = new Map<string, DayEntry<T>[]>()
  for (const { item, kind } of items) {
    const r = rangeOf(item, planned[item.id])
    if (!r) continue
    const startKey = dayKey(r.start), endKey = dayKey(r.end)
    for (let i = 0; i <= 120; i++) {
      const d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i, 12)
      if (d > r.end) break
      const k = dayKey(d)
      const list = map.get(k) || []
      list.push({ item, kind, first: k === startKey || d.getDay() === 0, last: k === endKey, planned: !!planned[item.id] })
      map.set(k, list)
    }
  }
  return map
}

const PRI: Record<string, number> = { urgent: 0, critical: 0, high: 1, medium: 2, low: 3 }
export const priorityRank = (p?: string | null) => PRI[(p || "").toLowerCase()] ?? 2

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Todos that duplicate a step are hidden: migrations 056–058 copied todos into
 * steps and left both, so the same work would appear twice in the backlog.
 */
export function dedupeTodos<T extends { title: string; stepId?: string | null; step_id?: string | null; status?: string | null }>(
  todos: T[], stepTitles: string[],
): T[] {
  const seen = new Set(stepTitles.map(norm))
  return todos.filter((t) => t.status !== "completed" && !t.stepId && !t.step_id && !seen.has(norm(t.title)))
}

/** Open items with no dates, most urgent first. Completed work never needs scheduling. */
export function unscheduled<T extends Plannable>(items: { item: T; kind: "step" | "todo" }[], planned: Record<string, PlannedRange>) {
  return items
    .filter(({ item }) => item.status !== "completed" && !rangeOf(item, planned[item.id]))
    .sort((a, b) => priorityRank(a.item.priority) - priorityRank(b.item.priority))
}

/** Add n days to an ISO date. */
export function addDays(iso: string, n: number): string {
  const d = dayOf(iso)!
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12))
}

/** Timeline axis: one tick per day, `week` true on Mondays. */
export function dayTicks(min: Date, max: Date): { date: Date; week: boolean }[] {
  const out: { date: Date; week: boolean }[] = []
  for (let i = 0; i < 2000; i++) {
    const d = new Date(min.getFullYear(), min.getMonth(), min.getDate() + i, 12)
    if (d > max) break
    out.push({ date: d, week: d.getDay() === 1 })
  }
  return out
}
