/**
 * Assertions for lib/scheduling.ts. Run with a tsx that is not 4.21.0:
 *   npx -y tsx@4.23.15 lib/scheduling.assert.ts
 *
 * A Gantt that puts a bar in the wrong place looks perfectly fine to a type
 * checker and to a DOM query — the old one fabricated dates for 414 of 477
 * rows and passed every static check. These are the assertions that would
 * have caught it.
 */

import {
  isScheduled,
  barDates,
  scheduleFromDueDate,
  toDateInput,
  phaseLabel,
  dayCount,
  barRect,
  todayPct,
  dayTicks,
  monthBands,
  rollupProgress,
  WEEK_MS,
} from "./scheduling"

let pass = 0
let fail = 0

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) pass++
  else {
    fail++
    console.error(`FAIL ${what}\n  expected ${b}\n  actual   ${a}`)
  }
}
function close(actual: number | null, expected: number, what: string, tol = 0.01) {
  if (actual !== null && Math.abs(actual - expected) <= tol) pass++
  else {
    fail++
    console.error(`FAIL ${what}\n  expected ~${expected}\n  actual    ${actual}`)
  }
}

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)

/* ───────────────────────────── scheduled-ness ─────────────────────────── */

eq(isScheduled(null), false, "a missing step is not scheduled")
eq(isScheduled({ start_date: null, end_date: null }), false, "no dates means not scheduled")
eq(isScheduled({ start_date: "", end_date: "" }), false, "empty strings are not dates")
eq(isScheduled({ end_date: "2026-10-03" }), true, "one date is enough to be on the timeline")

eq(barDates(null), null, "an unscheduled step gets no bar — it must not be drawn")
eq(
  barDates({ start_date: "2026-10-01T00:00:00Z", end_date: "2026-10-05T00:00:00Z" })!.start.getTime(),
  new Date("2026-10-01T00:00:00Z").getTime(),
  "both dates present are used as-is",
)
eq(
  barDates({ end_date: "2026-10-08T00:00:00Z" })!.start.getTime(),
  new Date("2026-10-08T00:00:00Z").getTime() - WEEK_MS,
  "an end-only step starts a week before its end",
)

/* ──────────────────────────────── day count ───────────────────────────── */

eq(dayCount(D(2026, 10, 1), D(2026, 10, 1)), 1, "a single day counts as one, not zero")
eq(dayCount(D(2026, 10, 1), D(2026, 10, 31)), 31, "a full October is 31 days")
eq(dayCount(D(2026, 10, 31), D(2026, 10, 1)), 1, "a reversed range never goes negative")
eq(dayCount(D(2026, 2, 1), D(2026, 3, 1)), 29, "February 2026 spans correctly into March")

/* ──────────────────────────────── bar rect ────────────────────────────── */

const rs = D(2026, 10, 1)
const re = D(2026, 10, 10) // 10-day window

eq(barRect({ start: D(2026, 10, 1), end: D(2026, 10, 1) }, rs, re), { leftPct: 0, widthPct: 10 },
  "a one-day bar at the range start is one column wide, flush left")
eq(barRect({ start: D(2026, 10, 10), end: D(2026, 10, 10) }, rs, re), { leftPct: 90, widthPct: 10 },
  "a one-day bar on the last day ends flush right, not overflowing")
eq(barRect({ start: D(2026, 10, 1), end: D(2026, 10, 10) }, rs, re), { leftPct: 0, widthPct: 100 },
  "a bar spanning the whole range fills it exactly")
eq(barRect({ start: D(2026, 10, 3), end: D(2026, 10, 4) }, rs, re), { leftPct: 20, widthPct: 20 },
  "an interior bar lands on its own columns")

eq(barRect({ start: D(2026, 9, 20), end: D(2026, 10, 2) }, rs, re), { leftPct: 0, widthPct: 20 },
  "a bar starting before the window is clamped, not dropped — the work is real")
eq(barRect({ start: D(2026, 10, 9), end: D(2026, 11, 20) }, rs, re), { leftPct: 80, widthPct: 20 },
  "a bar running past the window is clipped to the right edge")
eq(barRect({ start: D(2026, 8, 1), end: D(2026, 8, 20) }, rs, re), null,
  "a bar entirely before the window is not drawn at all")
eq(barRect({ start: D(2026, 12, 1), end: D(2026, 12, 5) }, rs, re), null,
  "a bar entirely after the window is not drawn at all")

/* ─────────────────────────────── today line ───────────────────────────── */

eq(todayPct(rs, re, D(2026, 9, 30)), null, "today before the range draws no line")
eq(todayPct(rs, re, D(2026, 10, 11)), null, "today after the range draws no line")
close(todayPct(rs, re, D(2026, 10, 1)), 5, "today on day one sits mid-column, not on the edge")
close(todayPct(rs, re, D(2026, 10, 10)), 95, "today on the last day stays inside the chart")

/* ──────────────────────────────── header ──────────────────────────────── */

const ticks = dayTicks(rs, re)
eq(ticks.length, 10, "one tick per day in the range")
eq(ticks[0].label, "1", "first tick is labelled with its day of month")
eq(ticks[9].label, "10", "last tick is the range end")
close(ticks.reduce((a, t) => a + t.widthPct, 0), 100, "ticks tile the width exactly")

const bands = monthBands(D(2026, 10, 20), D(2026, 12, 5))
eq(bands.map((b) => b.label), ["Oct 2026", "Nov 2026", "Dec 2026"], "a band per month touched")
close(bands.reduce((a, b) => a + b.widthPct, 0), 100, "bands tile the width exactly")
eq(bands[0].leftPct, 0, "a range starting mid-month clips the first band flush left")
eq(
  monthBands(D(2026, 10, 5), D(2026, 10, 9)).length,
  1,
  "a range inside one month yields a single band",
)

/* ─────────────────────────────── rollups ──────────────────────────────── */

eq(rollupProgress([]), null, "an empty phase shows no rollup rather than a confident 0%")
eq(rollupProgress([{ progress: 100 }, { progress: 0 }]), 50, "rollup is the mean of its steps")
eq(rollupProgress([{ progress: 100 }, { progress: null }]), 50, "a null progress counts as zero, not as absent")
eq(rollupProgress([{ progress: NaN }]), 0, "NaN does not poison the average")
eq(rollupProgress([{ progress: 33 }, { progress: 33 }, { progress: 34 }]), 33, "rollup is rounded")

/* ───────────────────────────── misc helpers ───────────────────────────── */

eq(toDateInput(null), "", "no date yields an empty input value")
eq(toDateInput("not a date"), "", "an unparseable date yields empty, not NaN")
eq(toDateInput("2026-10-03T12:00:00Z"), "2026-10-03", "an ISO string becomes yyyy-mm-dd")
eq(phaseLabel(""), "Unphased", "a blank phase is labelled, not left empty")
eq(phaseLabel("construction"), "construction", "a word phase passes through")
eq(phaseLabel(3), "Unphased", "a numeric phase does not become NaN")

const sched = scheduleFromDueDate("2026-12-25", D(2026, 10, 3))
eq(sched!.end_date.slice(0, 10), "2026-12-25", "placing a step uses the chosen due date")
eq(sched!.start_date.slice(0, 10), "2026-10-03", "a future due date starts the bar today")
const past = scheduleFromDueDate("2026-09-01", D(2026, 10, 3))
eq(past!.start_date.slice(0, 10), "2026-09-01", "a past due date collapses rather than running backwards")
eq(scheduleFromDueDate("", D(2026, 10, 3)), null, "no due date places nothing")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
