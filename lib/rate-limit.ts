/**
 * Postgres-backed fixed-window rate limiter.
 *
 * Counters live in rate_limit_counters (migration 061) so every Vercel
 * function instance shares them; the old in-memory Map was per instance and
 * reset on cold start. One atomic upsert per check:
 *
 *   INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
 *   RETURNING count
 *
 * Fails CLOSED: if the counter cannot be read or written the request is
 * refused. A planner whose database is unreachable cannot serve the request
 * anyway, and an AI or email path must never run uncounted.
 *
 * Expired rows are deleted opportunistically (about 1 call in 100), so no cron
 * is needed.
 */

import { sql as defaultSql } from "@/lib/db/client"

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>

/** Probability that a check also deletes expired counter rows. */
export const CLEANUP_PROBABILITY = 0.01

/** Start of the fixed window containing `nowMs`. Pure. */
export function windowStartMs(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs
}

export interface RateLimiterDeps {
  sql: SqlTag
  now: () => number
  random: () => number
}

/** Builds a limiter over injected dependencies (the harness passes a fake). */
export function createRateLimiter(deps: RateLimiterDeps) {
  return async function check(key: string, limit: number = 60, windowMs: number = 60000): Promise<boolean> {
    if (!key || limit <= 0 || windowMs <= 0) return false
    const now = deps.now()
    const start = windowStartMs(now, windowMs)
    const windowStart = new Date(start).toISOString()
    const expiresAt = new Date(start + windowMs).toISOString()
    try {
      const rows = (await deps.sql`
        INSERT INTO rate_limit_counters (key, window_start, count, expires_at)
        VALUES (${key}, ${windowStart}::timestamptz, 1, ${expiresAt}::timestamptz)
        ON CONFLICT (key, window_start)
        DO UPDATE SET count = rate_limit_counters.count + 1
        RETURNING count
      `) as { count: number | string }[]
      const count = Number(rows[0]?.count)
      if (deps.random() < CLEANUP_PROBABILITY) {
        try {
          await deps.sql`DELETE FROM rate_limit_counters WHERE expires_at < NOW()`
        } catch (cleanupError) {
          console.error("[rate-limit] cleanup failed:", cleanupError)
        }
      }
      if (!Number.isFinite(count)) return false
      return count <= limit
    } catch (error) {
      console.error(`[rate-limit] counter unavailable for ${key.split(":")[0]}; refusing:`, error)
      return false
    }
  }
}

const limiter = createRateLimiter({
  sql: defaultSql as unknown as SqlTag,
  now: () => Date.now(),
  random: () => Math.random(),
})

/**
 * Check if a request is within the rate limit
 * @param key - Unique identifier (e.g., `chat:${userId}`, `oauth-register:${ip}`)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60 seconds)
 * @returns true if the request is allowed, false if rate limited or the
 *   counter is unavailable (fails closed)
 */
export function checkRateLimit(key: string, limit: number = 60, windowMs: number = 60000): Promise<boolean> {
  return limiter(key, limit, windowMs)
}

/**
 * Client IP for per-IP limits. Uses what the Vercel edge sets (request.ip /
 * x-real-ip), never the first x-forwarded-for entry, which the caller controls.
 */
export function clientIp(request: { ip?: string; headers: Headers }): string {
  return request.ip || request.headers.get("x-real-ip")?.trim() || "unknown"
}

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

// ============================================================================
// Resets (owner-only callers: reset_ai_limits MCP tool, /api/admin/ai-limits/reset)
// ============================================================================

export type ResetScope = "user" | "global" | "all"
export type ResetKind = "ai_tokens" | "rate" | "all"

export interface ResetOptions {
  /** 'user' needs identity. Defaults to 'user' when identity is given, else 'all'. */
  scope?: ResetScope
  /**
   * Who to reset. AI tokens: a userId. Rate counters: the last segment(s) of
   * a counter key — a userId, an MCP API key id, or an IP.
   */
  identity?: string
  /** Which counters. Default 'all'. */
  kind?: ResetKind
}

export type ResetPlan =
  | { ok: true; scope: ResetScope; identity: string | null; kind: ResetKind; ai: boolean; rate: boolean }
  | { ok: false; error: string }

/** Validates and normalises reset options. Pure. */
export function planReset(opts: ResetOptions): ResetPlan {
  const identity = typeof opts.identity === "string" && opts.identity.trim() ? opts.identity.trim() : null
  const scope: ResetScope = opts.scope ?? (identity ? "user" : "all")
  const kind: ResetKind = opts.kind ?? "all"
  if (!["user", "global", "all"].includes(scope)) return { ok: false, error: `Unknown scope: ${scope}` }
  if (!["ai_tokens", "rate", "all"].includes(kind)) return { ok: false, error: `Unknown kind: ${kind}` }
  if (scope === "user" && !identity) return { ok: false, error: "scope 'user' needs an identity (userId, API key id or IP)" }
  if (scope !== "user" && identity) return { ok: false, error: `identity is only valid with scope 'user'` }
  if (identity && identity.length > 200) return { ok: false, error: "identity too long" }
  const ai = kind !== "rate"
  // Rate counters are all per-identity; there is no global rate counter.
  const rate = kind !== "ai_tokens" && scope !== "global"
  if (!ai && !rate) return { ok: false, error: "scope 'global' has no rate counters; use kind 'ai_tokens' or 'all'" }
  return { ok: true, scope, identity, kind, ai, rate }
}

/** Escapes LIKE wildcards so an identity matches literally. Pure. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export interface ResetResult {
  scope: ResetScope
  identity: string | null
  kind: ResetKind
  aiRowsCleared: number
  rateRowsCleared: number
}

/**
 * Clears counters so the affected limits start fresh now. AI token rows are
 * deleted only for windows still active (history of past windows is kept);
 * rate counters are deleted outright. Every reset is logged to limit_resets
 * and the server log. Callers MUST have checked the actor is the platform
 * owner (lib/auth/platform-admin.ts). Throws on database errors.
 */
export async function resetLimits(
  opts: ResetOptions,
  actor: { userId: string; via: string },
): Promise<ResetResult> {
  const plan = planReset(opts)
  if (!plan.ok) throw new Error(plan.error)
  const sql = defaultSql as unknown as SqlTag
  let aiRows = 0
  let rateRows = 0

  if (plan.ai) {
    const rows = (plan.scope === "user"
      ? await sql`DELETE FROM ai_token_usage WHERE scope = ${`user:${plan.identity}`} AND window_end > NOW() RETURNING 1`
      : plan.scope === "global"
        ? await sql`DELETE FROM ai_token_usage WHERE scope = 'global' AND window_end > NOW() RETURNING 1`
        : await sql`DELETE FROM ai_token_usage WHERE window_end > NOW() RETURNING 1`) as unknown[]
    aiRows = rows.length
  }
  if (plan.rate) {
    let rows: unknown[]
    if (plan.scope === "user") {
      const id = escapeLike(plan.identity!)
      rows = (await sql`
        DELETE FROM rate_limit_counters
        WHERE key LIKE ${`%:${id}`} OR key LIKE ${`%:${id}:%`}
        RETURNING 1
      `) as unknown[]
    } else {
      rows = (await sql`DELETE FROM rate_limit_counters RETURNING 1`) as unknown[]
    }
    rateRows = rows.length
  }

  console.warn(
    `[limits] RESET by ${actor.userId} via ${actor.via}: scope=${plan.scope} identity=${plan.identity ?? "-"} kind=${plan.kind} ai_rows=${aiRows} rate_rows=${rateRows}`,
  )
  await sql`
    INSERT INTO limit_resets (actor_user_id, via, scope, identity, kind, ai_rows, rate_rows)
    VALUES (${actor.userId}, ${actor.via}, ${plan.scope}, ${plan.identity}, ${plan.kind}, ${aiRows}, ${rateRows})
  `
  return { scope: plan.scope, identity: plan.identity, kind: plan.kind, aiRowsCleared: aiRows, rateRowsCleared: rateRows }
}
