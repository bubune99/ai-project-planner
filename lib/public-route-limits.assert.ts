/**
 * Checks for the request limits on the routes that answer without a signed-in caller.
 * Run: npx -y tsx@4.23.15 lib/public-route-limits.assert.ts
 */
import { createRateLimiter } from "./rate-limit"
import { PUBLIC_ROUTE_LIMITS, publicLimitKey, type PublicRoute } from "./public-route-limits"

let passed = 0
let failed = 0
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) passed++
  else {
    failed++
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`)
  }
}

/** The limiter's own upsert, counted in memory (same fake as lib/ai/spend-limits.assert.ts). */
function fakeDb() {
  const rows = new Map<string, number>()
  const sql = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const k = `${values[0]}|${values[1]}`
    const c = (rows.get(k) ?? 0) + 1
    rows.set(k, c)
    return [{ count: String(c) }]
  }
  return { sql }
}

const T = Date.parse("2026-11-22T12:00:00Z")
const ROUTES = Object.keys(PUBLIC_ROUTE_LIMITS) as PublicRoute[]

async function main() {
  // ---- the numbers ------------------------------------------------------
  eq(ROUTES, ["health", "invitation", "oauthToken"], "the three limited routes")
  eq([PUBLIC_ROUTE_LIMITS.health.limit, PUBLIC_ROUTE_LIMITS.health.windowMs], [60, 60_000], "health: 60 a minute")
  eq([PUBLIC_ROUTE_LIMITS.invitation.limit, PUBLIC_ROUTE_LIMITS.invitation.windowMs], [30, 60_000], "invitation: 30 a minute")
  eq([PUBLIC_ROUTE_LIMITS.oauthToken.limit, PUBLIC_ROUTE_LIMITS.oauthToken.windowMs], [30, 60_000], "code exchange: 30 a minute")

  // ---- keys -------------------------------------------------------------
  eq(publicLimitKey("health", "203.0.113.7"), "public-health:203.0.113.7", "health key ends with the address")
  eq(new Set(ROUTES.map((r) => publicLimitKey(r, "203.0.113.7"))).size, ROUTES.length, "each route counts on its own")
  eq(ROUTES.some((r) => publicLimitKey(r, "x").startsWith("oauth-register:")), false, "never shares the registration counter")
  eq(publicLimitKey("invitation", "2001:db8::1"), "public-invitation:2001:db8::1", "an IPv6 address stays whole and last")
  eq(publicLimitKey("health", ""), "public-health:unknown", "no address counts as one shared caller, never an empty key")

  // ---- against the real limiter ----------------------------------------
  for (const route of ROUTES) {
    const { limit, windowMs } = PUBLIC_ROUTE_LIMITS[route]
    let now = T
    const check = createRateLimiter({ sql: fakeDb().sql, now: () => now, random: () => 0.5 })
    const key = publicLimitKey(route, "203.0.113.7")
    const answers: boolean[] = []
    for (let i = 0; i < limit + 1; i++) answers.push(await check(key, limit, windowMs))
    eq(answers.filter(Boolean).length, limit, `${route}: exactly ${limit} allowed in one window`)
    eq(answers[limit], false, `${route}: request ${limit + 1} refused`)
    eq(await check(publicLimitKey(route, "198.51.100.9"), limit, windowMs), true, `${route}: another address is not affected`)
    now = T + windowMs
    eq(await check(key, limit, windowMs), true, `${route}: allowed again in the next window`)
  }

  // An uptime checker asking once a minute, for a whole day, never meets the limit.
  {
    const { limit, windowMs } = PUBLIC_ROUTE_LIMITS.health
    let now = T
    const check = createRateLimiter({ sql: fakeDb().sql, now: () => now, random: () => 0.5 })
    let refused = 0
    for (let minute = 0; minute < 24 * 60; minute++) {
      now = T + minute * 60_000
      if (!(await check(publicLimitKey("health", "203.0.113.7"), limit, windowMs))) refused++
    }
    eq(refused, 0, "uptime checker once a minute for a day: never refused")
  }

  // Five monitors behind one address, each asking every 10 seconds (30 a minute), still pass.
  {
    const { limit, windowMs } = PUBLIC_ROUTE_LIMITS.health
    const check = createRateLimiter({ sql: fakeDb().sql, now: () => T, random: () => 0.5 })
    let refused = 0
    for (let i = 0; i < 30; i++) if (!(await check(publicLimitKey("health", "203.0.113.7"), limit, windowMs))) refused++
    eq(refused, 0, "30 health checks a minute from one address: never refused")
  }

  // A person opening an invitation and reloading it ten times in a minute is never refused.
  {
    const { limit, windowMs } = PUBLIC_ROUTE_LIMITS.invitation
    const check = createRateLimiter({ sql: fakeDb().sql, now: () => T, random: () => 0.5 })
    let refused = 0
    for (let i = 0; i < 11; i++) if (!(await check(publicLimitKey("invitation", "203.0.113.7"), limit, windowMs))) refused++
    eq(refused, 0, "an invitation opened 11 times in a minute: never refused")
  }

  console.log(`public-route-limits.assert: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
