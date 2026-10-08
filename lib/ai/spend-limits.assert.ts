/**
 * Assertions for AI spend limits, the Postgres rate limiter and limit resets.
 * Run with a tsx that is not 4.21.0:
 *   npx -y tsx@4.23.15 lib/ai/spend-limits.assert.ts
 *
 * No database: the limiter runs over an in-memory fake of the one upsert it
 * issues, so window rollover, fail-closed and cleanup are exercised for real.
 */

import {
  readSpendLimits,
  windowFor,
  resetText,
  decideAdmission,
  usageTokens,
  RunBudget,
  trimHistory,
  DEFAULT_USER_WINDOW_TOKENS,
  DEFAULT_GLOBAL_WINDOW_TOKENS,
  DEFAULT_REQUEST_TOKENS,
  MAX_DELEGATE_CALLS,
} from "./spend-limits"
import { createRateLimiter, windowStartMs, planReset, escapeLike, clientIp } from "../rate-limit"
import { isPlatformAdmin } from "../auth/platform-admin"

let pass = 0
let fail = 0
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) pass++
  else {
    fail++
    console.error(`FAIL ${what}\n  expected ${e}\n  actual   ${a}`)
  }
}

const H = 3600_000
const T = Date.parse("2026-10-08T12:34:00Z")

// ---- env parsing --------------------------------------------------------
const d = readSpendLimits({})
eq([d.disabled, d.userTokens, d.userWindowHours, d.globalTokens, d.globalWindowHours, d.perRequest],
  [false, DEFAULT_USER_WINDOW_TOKENS, 5, DEFAULT_GLOBAL_WINDOW_TOKENS, 24, DEFAULT_REQUEST_TOKENS], "defaults")
eq(readSpendLimits({ AI_DISABLED: "1" }).disabled, true, "kill switch 1")
eq(readSpendLimits({ AI_DISABLED: "true" }).disabled, true, "kill switch true")
eq(readSpendLimits({ AI_DISABLED: "0" }).disabled, false, "kill switch 0")
eq(readSpendLimits({ AI_USER_DAILY_TOKEN_LIMIT: "2_000" }).userTokens, 2000, "legacy daily alias")
eq(readSpendLimits({ AI_USER_TOKEN_LIMIT: "300", AI_USER_DAILY_TOKEN_LIMIT: "999" }).userTokens, 300, "new name wins")
eq(readSpendLimits({ AI_GLOBAL_TOKEN_LIMIT: "0" }).globalTokens, 0, "global 0 = off")
eq(readSpendLimits({ AI_USER_TOKEN_LIMIT: "abc" }).userTokens, DEFAULT_USER_WINDOW_TOKENS, "garbage -> default")
eq(readSpendLimits({ AI_BUDGET_WINDOW_HOURS: "24" }).userWindowHours, 24, "24h window allowed")
eq(readSpendLimits({ AI_BUDGET_WINDOW_HOURS: "0" }).userWindowHours, 5, "0h window rejected")
eq(readSpendLimits({ AI_BUDGET_WINDOW_HOURS: "-3" }).userWindowHours, 5, "negative window rejected")
eq(readSpendLimits({ AI_BUDGET_WINDOW_HOURS: "10000" }).userWindowHours, 5, "absurd window rejected")
eq(readSpendLimits({ AI_REQUEST_TOKEN_LIMIT: "0" }).perRequest, DEFAULT_REQUEST_TOKENS, "per-request 0 -> default (never unlimited)")

// ---- windows and rollover ----------------------------------------------
const w5 = windowFor(T, 5)
eq([new Date(w5.start).toISOString(), new Date(w5.end).toISOString()],
  ["2026-10-08T09:00:00.000Z", "2026-10-08T14:00:00.000Z"], "5h window bounds (epoch aligned)")
eq(w5.start % (5 * H), 0, "5h window start is a multiple of 5h since epoch")
eq(windowFor(w5.end - 1, 5).start, w5.start, "last ms still in window")
eq(windowFor(w5.end, 5).start, w5.end, "rollover at end: next window starts at previous end")
eq(windowFor(w5.end, 5).end - windowFor(w5.end, 5).start, 5 * H, "next window length")
const w24 = windowFor(T, 24)
eq([new Date(w24.start).toISOString(), new Date(w24.end).toISOString()],
  ["2026-10-08T00:00:00.000Z", "2026-10-09T00:00:00.000Z"], "24h window = UTC day")
eq(T >= w5.start && T < w5.end, true, "now inside its window")

// ---- resetAt human text ------------------------------------------------
eq(resetText(w5.end, T), "in 1h 26m (14:00 UTC)", "resetText same day")
eq(resetText(w24.end, T), "in 11h 26m (2026-10-09 00:00 UTC)", "resetText next day shows date")
eq(resetText(T + 30_000, T), "in 1m (12:34 UTC)", "resetText rounds up to 1m")
eq(resetText(T + 2 * H, T), "in 2h (14:34 UTC)", "resetText whole hours")

// ---- admission ---------------------------------------------------------
const L = readSpendLimits({ AI_USER_TOKEN_LIMIT: "1000", AI_GLOBAL_TOKEN_LIMIT: "5000" })
eq(decideAdmission(L, { user: 0, global: 0 }, T), { ok: true }, "fresh -> ok")
eq(decideAdmission(L, { user: 999, global: 4999 }, T).ok, true, "just under -> ok")
const u = decideAdmission(L, { user: 1000, global: 0 }, T)
eq(u.ok ? null : [u.status, u.code, u.resetAt], [429, "USER_LIMIT", "2026-10-08T14:00:00.000Z"], "user limit -> 429 + resetAt = window end")
eq(!u.ok && u.message.includes("in 1h 26m (14:00 UTC)") && u.message.includes("5-hour window"), true, "user limit message says when it resets")
const g = decideAdmission(L, { user: 0, global: 5000 }, T)
eq(g.ok ? null : [g.status, g.code, g.resetAt], [503, "GLOBAL_LIMIT", "2026-10-09T00:00:00.000Z"], "global ceiling -> 503 + resetAt = global window end")
eq(decideAdmission({ ...L, globalTokens: 0 }, { user: 0, global: 9e9 }, T).ok, true, "global 0 = no ceiling")
const n = decideAdmission(L, null, T)
eq(n.ok ? null : [n.status, n.code], [503, "USAGE_UNAVAILABLE"], "unreadable usage -> fail closed")
const k = decideAdmission({ ...L, disabled: true }, { user: 0, global: 0 }, T)
eq(k.ok ? null : k.code, "AI_DISABLED", "kill switch beats everything")
eq(decideAdmission({ ...L, userTokens: 0 }, { user: 0, global: 0 }, T).ok, false, "user limit 0 refuses")

// ---- usage + per-request budget ---------------------------------------
eq(usageTokens({ inputTokens: 100, outputTokens: 20, totalTokens: 120 }), 120, "totalTokens")
eq(usageTokens({ inputTokens: 100, outputTokens: 20 }), 120, "input+output fallback")
eq(usageTokens(undefined), 0, "no usage")
eq(usageTokens({ totalTokens: NaN }), 0, "NaN -> 0")
const b = new RunBudget(1000)
eq(b.exhausted(), false, "fresh budget")
b.add(600)
eq(b.tryDelegate(), true, "delegate 1")
eq(b.tryDelegate(), true, "delegate 2")
eq(b.tryDelegate(), true, "delegate 3")
eq(b.tryDelegate(), false, `delegate ${MAX_DELEGATE_CALLS + 1} refused`)
eq(b.delegateCalls, MAX_DELEGATE_CALLS, "refused delegate not counted")
b.add(400)
eq(b.exhausted(), true, "budget spent (delegate usage counts too)")
const b2 = new RunBudget(1000)
b2.failed = true
eq([b2.exhausted(), b2.tryDelegate()], [true, false], "failed record stops run and delegates")

// ---- history caps ------------------------------------------------------
const msg = (c: string, role: "user" | "assistant" = "user") => ({ role, content: c })
const hist = Array.from({ length: 40 }, (_, i) => msg(`m${i}`))
const t1 = trimHistory(hist, 30, 1e9)
eq([t1.length, t1[0].content, t1[29].content], [30, "m10", "m39"], "keeps newest 30, in order")
const t2 = trimHistory([msg("a".repeat(50)), msg("b".repeat(50)), msg("c".repeat(50))], 30, 120)
eq(t2.map((m) => m.content[0]), ["b", "c"], "char cap drops oldest")
const t3 = trimHistory([msg("x"), msg("y".repeat(500))], 30, 100)
eq(t3.map((m) => m.content), ["x"], "oversized newest skipped, older kept")

// ---- rate limiter over a fake upsert ----------------------------------
async function limiterAssertions() {
function fakeDb() {
  const rows = new Map<string, number>()
  let deletes = 0
  let broken = false
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (broken) throw new Error("db down")
    const q = strings.join("?")
    if (q.includes("DELETE FROM rate_limit_counters")) { deletes++; return [] }
    const k = `${values[0]}|${values[1]}`
    const c = (rows.get(k) ?? 0) + 1
    rows.set(k, c)
    return [{ count: String(c) }]
  }
  return { sql, rows, get deletes() { return deletes }, breakIt() { broken = true } }
}
let now = T
const db = fakeDb()
const check = createRateLimiter({ sql: db.sql, now: () => now, random: () => 0.5 })
const results: boolean[] = []
for (let i = 0; i < 4; i++) results.push(await check("chat:u1", 3, 60_000))
eq(results, [true, true, true, false], "3/min: 4th refused")
eq(await check("chat:u2", 3, 60_000), true, "other key independent")
now = windowStartMs(T, 60_000) + 60_000
eq(await check("chat:u1", 3, 60_000), true, "new window rolls over")
eq(db.deletes, 0, "no cleanup at random 0.5")
const check2 = createRateLimiter({ sql: db.sql, now: () => now, random: () => 0.001 })
await check2("chat:u3", 3, 60_000)
eq(db.deletes, 1, "cleanup at random < 1%")
db.breakIt()
eq(await check("chat:u1", 3, 60_000), false, "db down -> fail closed")
eq(await check("", 3, 60_000), false, "empty key refused")
eq(windowStartMs(T, HOUR()), Date.parse("2026-10-08T12:00:00Z"), "hour window start")
function HOUR() { return H }

}

// ---- reset planning ----------------------------------------------------
eq(planReset({ identity: "u1" }), { ok: true, scope: "user", identity: "u1", kind: "all", ai: true, rate: true }, "identity -> user scope, all kinds")
eq(planReset({}), { ok: true, scope: "all", identity: null, kind: "all", ai: true, rate: true }, "no args -> everything")
eq(planReset({ scope: "global" }), { ok: true, scope: "global", identity: null, kind: "all", ai: true, rate: false }, "global: AI only (no global rate counters)")
eq(planReset({ scope: "global", kind: "rate" }).ok, false, "global+rate rejected")
eq(planReset({ scope: "user" }).ok, false, "user scope needs identity")
eq(planReset({ scope: "all", identity: "u1" }).ok, false, "identity only with user scope")
eq(planReset({ scope: "user", identity: "u1", kind: "ai_tokens" }), { ok: true, scope: "user", identity: "u1", kind: "ai_tokens", ai: true, rate: false }, "user ai only")
eq(planReset({ scope: "user", identity: "1.2.3.4", kind: "rate" }), { ok: true, scope: "user", identity: "1.2.3.4", kind: "rate", ai: false, rate: true }, "ip rate only")
eq(planReset({ kind: "bogus" as never }).ok, false, "unknown kind")
eq(planReset({ identity: "x".repeat(201) }).ok, false, "identity length cap")
eq(escapeLike("a_b%c\\d"), "a\\_b\\%c\\\\d", "LIKE wildcards escaped")

// ---- trustworthy IP + owner gate --------------------------------------
eq(clientIp({ headers: new Headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-real-ip": "1.1.1.1" }) }), "1.1.1.1", "x-real-ip, not first XFF")
eq(clientIp({ ip: "9.9.9.9", headers: new Headers({ "x-real-ip": "1.1.1.1" }) }), "9.9.9.9", "request.ip preferred")
eq(clientIp({ headers: new Headers({ "x-forwarded-for": "6.6.6.6" }) }), "unknown", "XFF alone ignored")
eq(isPlatformAdmin("u1", {}), false, "no env -> nobody is admin")
eq(isPlatformAdmin("u1", { PLANNER_ADMIN_USER_IDS: " u0 , u1 " }), true, "listed id is admin")
eq(isPlatformAdmin("u2", { PLANNER_ADMIN_USER_IDS: "u0,u1" }), false, "unlisted id is not")
eq(isPlatformAdmin("", { PLANNER_ADMIN_USER_IDS: "," }), false, "empty id never admin")

limiterAssertions().then(() => {
  console.log(`${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})
