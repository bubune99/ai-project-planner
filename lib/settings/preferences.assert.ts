/*
 * Checks for lib/settings/preferences.ts. Run: npx -y tsx@4.23.15 lib/settings/preferences.assert.ts
 */
import assert from "node:assert/strict"
import {
  modelFor, modelLabel, modelOptions, parsePatch, readPreferences, supportedZones, todayIn, zoneLabel,
} from "./preferences"

let n = 0
const ok = (cond: unknown, what: string) => { assert.ok(cond, what); n++ }
const eq = <T,>(a: T, b: T, what: string) => { assert.deepStrictEqual(a, b, what); n++ }

const ZONES = ["America/Los_Angeles", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"]
const MODELS = { main: "claude-sonnet-5-5", fast: "claude-haiku-4-5-20251001" }
const IDS = Object.values(MODELS)

// ── the runtime's list ────────────────────────────────────────────────────────
ok(supportedZones().includes("America/New_York"), "the runtime's list has New York")
ok(supportedZones().length > 100, "the runtime's list is the real one")
eq(zoneLabel("America/New_York"), "America/New York", "underscores read as spaces")

// ── today, for a zone, from an instant passed in ──────────────────────────────
const lateUtc = new Date("2026-11-23T03:30:00Z") // 22:30 on the 22nd in New York, 12:30 on the 23rd in Tokyo
eq(todayIn(null, lateUtc), "2026-11-23", "no stored zone: the server's day (UTC), as before")
eq(todayIn("America/New_York", lateUtc), "2026-11-22", "New York is still on the 22nd")
eq(todayIn("America/Los_Angeles", lateUtc), "2026-11-22", "Los Angeles is still on the 22nd")
eq(todayIn("Asia/Tokyo", lateUtc), "2026-11-23", "Tokyo is on the 23rd")
eq(todayIn("Pacific/Kiritimati", new Date("2026-12-31T10:30:00Z")), "2027-01-01", "UTC+14 crosses the year first")
eq(todayIn("America/New_York", new Date("2026-03-08T06:59:00Z")), "2026-03-08", "the night the clocks change, 01:59 local")
eq(todayIn("America/New_York", new Date("2026-03-08T03:59:00Z")), "2026-03-07", "an hour before midnight there")
eq(todayIn("Not/AZone", lateUtc), "2026-11-23", "a zone the runtime no longer knows falls back to UTC")
eq(todayIn("", lateUtc), "2026-11-23", "an empty zone falls back to UTC")
assert.throws(() => todayIn("Asia/Tokyo", new Date("nope")), /instant/, "a bad instant is refused, not turned into a date"); n++

// ── model names and the list offered ──────────────────────────────────────────
eq(modelLabel("claude-sonnet-5-5"), "Claude Sonnet 5.5", "a model id reads as its name")
eq(modelLabel("claude-haiku-4-5-20251001"), "Claude Haiku 4.5", "the date on the end is not part of the name")
eq(modelLabel("something-else"), "Something Else", "an unfamiliar id is still readable")
eq(modelOptions(MODELS), [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
], "the options are the app's models, in its order")
eq(modelOptions({ main: "claude-sonnet-5-5", other: "claude-sonnet-5-5" }).length, 1, "a model listed twice is offered once")

// ── which model a run uses ────────────────────────────────────────────────────
eq(modelFor("claude-sonnet-5-5", null, IDS), "claude-sonnet-5-5", "nothing chosen: the agent's own model")
eq(modelFor("claude-sonnet-5-5", "claude-haiku-4-5-20251001", IDS), "claude-haiku-4-5-20251001", "a chosen model the app offers is used")
eq(modelFor("claude-sonnet-5-5", "claude-sonnet-4", IDS), "claude-sonnet-5-5", "a retired stored model falls back to the app's default")
eq(modelFor("claude-sonnet-5-5", "gpt-9", IDS), "claude-sonnet-5-5", "an unknown stored model falls back")
eq(modelFor("claude-sonnet-5-5", "", IDS), "claude-sonnet-5-5", "an empty stored model falls back")

// ── reading what is stored (lenient: a bad stored value is as if nothing was chosen) ──
eq(readPreferences(undefined, ZONES, IDS), { timezone: null, defaultModel: null }, "no row: nothing chosen")
eq(readPreferences({ timezone: "Asia/Tokyo", default_model: "claude-haiku-4-5-20251001" }, ZONES, IDS),
  { timezone: "Asia/Tokyo", defaultModel: "claude-haiku-4-5-20251001" }, "a stored row reads back")
eq(readPreferences({ timezone: "Mars/Olympus", default_model: "claude-sonnet-4" }, ZONES, IDS),
  { timezone: null, defaultModel: null }, "stored values no longer offered read as not chosen")
eq(readPreferences({ timezone: 7, default_model: {} }, ZONES, IDS), { timezone: null, defaultModel: null }, "stored junk reads as not chosen")

// ── a change sent from the page (strict: anything not offered is refused) ─────
eq(parsePatch({ timezone: "Asia/Tokyo" }, ZONES, IDS), { ok: true, changes: { timezone: "Asia/Tokyo" } }, "a listed zone is accepted")
eq(parsePatch({ timezone: null }, ZONES, IDS), { ok: true, changes: { timezone: null } }, "null means this device's")
eq(parsePatch({ defaultModel: "claude-haiku-4-5-20251001" }, ZONES, IDS), { ok: true, changes: { defaultModel: "claude-haiku-4-5-20251001" } }, "an offered model is accepted")
eq(parsePatch({ defaultModel: null }, ZONES, IDS), { ok: true, changes: { defaultModel: null } }, "null means the planner's default")
eq(parsePatch({ timezone: "Asia/Tokyo", defaultModel: null }, ZONES, IDS), { ok: true, changes: { timezone: "Asia/Tokyo", defaultModel: null } }, "both at once")

const refused = (body: unknown, what: string) => { const r = parsePatch(body, ZONES, IDS); ok(!r.ok && r.message.length > 0, what) }
refused({ timezone: "Mars/Olympus" }, "a zone not in the list is refused")
refused({ timezone: "america/new_york" }, "a zone in the wrong case is refused")
refused({ timezone: "" }, "an empty zone is refused (null is how to clear it)")
refused({ timezone: 5 }, "a zone that is not text is refused")
refused({ timezone: "Asia/Tokyo'; DROP TABLE users; --" }, "a zone with extra text is refused")
refused({ defaultModel: "claude-sonnet-4" }, "a retired model is refused")
refused({ defaultModel: "gpt-9" }, "a model the app cannot call is refused")
refused({ defaultModel: ["claude-sonnet-5-5"] }, "a model that is not text is refused")
refused({}, "nothing to change is refused")
refused({ theme: "dark" }, "a setting this route does not own is refused")
refused({ timezone: "Asia/Tokyo", theme: "dark" }, "an extra field is refused, not dropped silently")
refused(null, "no body is refused")
refused("Asia/Tokyo", "a bare string is refused")
refused([{ timezone: "Asia/Tokyo" }], "a list is refused")
refused({ timezone: "Asia/Tokyo", defaultModel: "gpt-9" }, "one bad value refuses the whole change")

console.log(`preferences: ${n} checks pass`)
