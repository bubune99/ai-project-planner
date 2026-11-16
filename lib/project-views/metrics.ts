/**
 * Project metrics worked out from real step dates. Nothing estimated.
 * Pure; pass `now`. Checked by metrics.assert.ts.
 */

import { DAY, dayKey } from "./schedule"

export interface StepDates {
  status?: string | null
  created_at?: string | null
  completed_at?: string | null
  deleted_at?: string | null
  is_subtask?: boolean | null
}

/**
 * Monday of the week, as a calendar key. Keys, not timestamps: subtracting
 * 7×24h across a clock change lands an hour off and never matches (that bug
 * hid every week before Nov 2 in the mock-up).
 */
export function weekOf(d: Date | string): string {
  const x = new Date(d)
  const m = new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7), 12)
  return dayKey(m)
}

export function lastWeeks(now: Date, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(weekOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7, 12)))
  return out
}

export interface Metrics {
  weeks: { week: string; added: number; done: number }[]
  doneLast4: number
  donePrev4: number
  medianDays: number | null
  open: number
  inProgress: number
  ages: { label: string; count: number }[]
  lastDone: Date | null
}

export function projectMetrics(steps: StepDates[], now: Date, nWeeks = 12): Metrics {
  const live = steps.filter((s) => !s.deleted_at)
  const weeks = lastWeeks(now, nWeeks).map((week) => ({
    week,
    added: live.filter((s) => s.created_at && weekOf(s.created_at) === week).length,
    done: live.filter((s) => s.completed_at && weekOf(s.completed_at) === week).length,
  }))
  const done = weeks.map((w) => w.done)
  const cycle = live
    .filter((s) => s.completed_at && s.created_at)
    .map((s) => (new Date(s.completed_at!).getTime() - new Date(s.created_at!).getTime()) / DAY)
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
  const open = live.filter((s) => s.status !== "completed")
  const age = (s: StepDates) => (now.getTime() - new Date(s.created_at || now).getTime()) / DAY
  const ages: [string, (a: number) => boolean][] = [
    ["Under a week", (a) => a < 7],
    ["1–4 weeks", (a) => a >= 7 && a < 30],
    ["1–3 months", (a) => a >= 30 && a < 90],
    ["Over 3 months", (a) => a >= 90],
  ]
  const lastDone = live.filter((s) => s.completed_at).map((s) => new Date(s.completed_at!)).sort((a, b) => +b - +a)[0] || null
  return {
    weeks,
    doneLast4: done.slice(-4).reduce((a, b) => a + b, 0),
    donePrev4: done.slice(-8, -4).reduce((a, b) => a + b, 0),
    medianDays: cycle.length ? cycle[Math.floor(cycle.length / 2)] : null,
    open: open.length,
    inProgress: live.filter((s) => s.status === "in-progress" || s.status === "in_progress").length,
    ages: ages.map(([label, f]) => ({ label, count: open.filter((s) => f(age(s))).length })),
    lastDone,
  }
}

/** Plain words for the median: "Same day" is honest when work is logged after it is done. */
export function medianLabel(days: number | null): string {
  if (days == null) return "—"
  if (days < 1) return "Same day"
  const d = Math.round(days)
  return d === 1 ? "1 day" : `${d} days`
}

/** A figure on the Metrics tab that can be opened to the tasks it counts. */
export type Figure = "doneLast4" | "inProgress" | "open" | `age:${number}` | `week:${string}:${"added" | "done"}`

/**
 * The tasks behind a figure, exactly as projectMetrics counts them (Metrics check, 2026-11-15: "61 open over 3
 * months: which ones?"). Newest first. Pure; pass `now`.
 */
export function figureMembers<S extends StepDates>(steps: S[], now: Date, fig: Figure, nWeeks = 12): S[] {
  const live = steps.filter((s) => !s.deleted_at)
  const age = (s: StepDates) => (now.getTime() - new Date(s.created_at || now).getTime()) / DAY
  const bands: [number, number][] = [[0, 7], [7, 30], [30, 90], [90, Infinity]]
  const newest = (key: "created_at" | "completed_at") => (a: S, b: S) => +new Date(b[key] || 0) - +new Date(a[key] || 0)
  if (fig === "doneLast4") {
    const keep = new Set(lastWeeks(now, nWeeks).slice(-4))
    return live.filter((s) => s.completed_at && keep.has(weekOf(s.completed_at))).sort(newest("completed_at"))
  }
  if (fig === "inProgress") return live.filter((s) => s.status === "in-progress" || s.status === "in_progress").sort(newest("created_at"))
  if (fig === "open") return live.filter((s) => s.status !== "completed").sort(newest("created_at"))
  if (fig.startsWith("age:")) {
    const [lo, hi] = bands[Number(fig.slice(4))] || [0, -1]
    return live.filter((s) => s.status !== "completed" && age(s) >= lo && age(s) < hi).sort(newest("created_at"))
  }
  const [, week, what] = fig.split(":")
  return what === "done"
    ? live.filter((s) => s.completed_at && weekOf(s.completed_at) === week).sort(newest("completed_at"))
    : live.filter((s) => s.created_at && weekOf(s.created_at) === week).sort(newest("created_at"))
}
