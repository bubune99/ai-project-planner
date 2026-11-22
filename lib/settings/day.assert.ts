/*
 * Checks for lib/settings/day.ts. Run: npx -y tsx@4.23.15 lib/settings/day.assert.ts
 */
import assert from "node:assert/strict"
import { addDays, dayIn, monthWindow, userDayAt } from "./day"

let n = 0
const eq = <T,>(a: T, b: T, what: string) => { assert.deepStrictEqual(a, b, what); n++ }
const throws = (fn: () => unknown, re: RegExp, what: string) => { assert.throws(fn, re, what); n++ }

// ── the user's today ──────────────────────────────────────────────────────────
// 03:30 UTC on the 23rd: still the 22nd in New York, already the 23rd in Tokyo.
const lateUtc = new Date("2026-11-23T03:30:00Z")
eq(userDayAt(null, lateUtc), { today: "2026-11-23", zone: null }, "no zone stored: the UTC date, which is the database's CURRENT_DATE")
eq(userDayAt("America/New_York", lateUtc), { today: "2026-11-22", zone: "America/New_York" }, "New York is a day behind UTC in its evening")
eq(userDayAt("Asia/Tokyo", lateUtc), { today: "2026-11-23", zone: "Asia/Tokyo" }, "Tokyo agrees with UTC at that hour")
// 16:00 UTC on the 22nd: already the 23rd in Tokyo and Kiritimati.
const afternoonUtc = new Date("2026-11-22T16:00:00Z")
eq(userDayAt("Asia/Tokyo", afternoonUtc).today, "2026-11-23", "Tokyo is a day ahead of UTC in its morning")
eq(userDayAt(null, afternoonUtc).today, "2026-11-22", "and with no zone it is still the UTC date")
eq(userDayAt("Not/AZone", afternoonUtc), { today: "2026-11-22", zone: null }, "a zone the runtime does not know counts as none")
eq(userDayAt("", afternoonUtc), { today: "2026-11-22", zone: null }, "an empty zone counts as none")
throws(() => userDayAt("Asia/Tokyo", new Date("nope")), /instant/, "a bad instant is refused")

// With no zone, every instant of a UTC day gives that UTC date: nothing changes for someone who has not chosen.
for (const t of ["2026-02-28T00:00:00Z", "2026-02-28T23:59:59Z", "2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z"]) {
  eq(userDayAt(null, new Date(t)).today, t.slice(0, 10), `no zone at ${t}`)
}

// ── the day an instant falls on (grouping a list by day) ──────────────────────
eq(dayIn(null, new Date("2026-11-22T23:30:00Z")), "2026-11-22", "no zone: the UTC date of the instant")
eq(dayIn("Asia/Tokyo", new Date("2026-11-22T23:30:00Z")), "2026-11-23", "an event at 08:30 on the 23rd in Tokyo sits on the 23rd")
eq(dayIn("America/Los_Angeles", new Date("2026-11-23T02:00:00Z")), "2026-11-22", "an event at 18:00 on the 22nd in Los Angeles sits on the 22nd")

// ── N days from a day ─────────────────────────────────────────────────────────
eq(addDays("2026-11-22", 0), "2026-11-22", "no days is the same day")
eq(addDays("2026-11-22", 7), "2026-11-29", "a week on")
eq(addDays("2026-11-22", 30), "2026-12-22", "thirty days on crosses the month")
eq(addDays("2026-12-25", 7), "2027-01-01", "and the year")
eq(addDays("2026-11-22", -30), "2026-10-23", "thirty days back")
eq(addDays("2026-03-01", -1), "2026-02-28", "back over a short February")
eq(addDays("2028-03-01", -1), "2028-02-29", "back over a leap day")
eq(addDays("2026-03-08", 1), "2026-03-09", "a day is a calendar day, whatever the clocks did that night")
throws(() => addDays("22/11/2026", 1), /YYYY-MM-DD/, "a day in another shape is refused")
throws(() => addDays("2026-02-30", 1), /YYYY-MM-DD/, "a day that does not exist is refused")
throws(() => addDays("2026-11-22", 1.5), /whole/, "half a day is refused")

// ── the month a day is in: first day, and the first day of the next (not included) ──
eq(monthWindow("2026-11-22"), { start: "2026-11-01", end: "2026-12-01" }, "November")
eq(monthWindow("2026-12-31"), { start: "2026-12-01", end: "2027-01-01" }, "December ends at the new year")
eq(monthWindow("2028-02-29"), { start: "2028-02-01", end: "2028-03-01" }, "a leap February")
eq(monthWindow("2026-01-01"), { start: "2026-01-01", end: "2026-02-01" }, "the first of a month is in that month")
throws(() => monthWindow("2026-13-01"), /YYYY-MM-DD/, "a month that does not exist is refused")

// The case the setting is for: at 03:30 UTC on December 1 it is still November in New York.
const monthTurn = new Date("2026-12-01T03:30:00Z")
eq(monthWindow(userDayAt(null, monthTurn).today).start, "2026-12-01", "no zone: December has begun")
eq(monthWindow(userDayAt("America/New_York", monthTurn).today).start, "2026-11-01", "New York: November's budget still counts")

console.log(`day: ${n} checks pass`)
