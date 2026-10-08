/**
 * AI token usage per window in ai_token_usage (migration 061).
 *
 * Rows: scope 'user:<userId>' (window = AI_BUDGET_WINDOW_HOURS) and scope
 * 'global' (window = AI_GLOBAL_WINDOW_HOURS), keyed by window_start so a new
 * window starts a new row. Read at admission (/api/chat); written after every
 * model step of the main agent and every delegate, so a stream the client
 * abandons is still counted.
 *
 * Server-only.
 */

import { sql } from "@/lib/db/client"
import { readSpendLimits, windowFor, type SpendLimits, type WindowUsage } from "./spend-limits"

export const GLOBAL_SCOPE = "global"
export const userScope = (userId: string) => `user:${userId}`

const iso = (ms: number) => new Date(ms).toISOString()

/** Current-window tokens for the user and site-wide. null when unreadable (callers fail closed). */
export async function readWindowUsage(
  userId: string,
  limits: SpendLimits = readSpendLimits(process.env),
  nowMs: number = Date.now(),
): Promise<WindowUsage | null> {
  try {
    const u = windowFor(nowMs, limits.userWindowHours)
    const g = windowFor(nowMs, limits.globalWindowHours)
    const rows = (await sql`
      SELECT scope, tokens FROM ai_token_usage
      WHERE (scope = ${userScope(userId)} AND window_start = ${iso(u.start)}::timestamptz)
         OR (scope = ${GLOBAL_SCOPE} AND window_start = ${iso(g.start)}::timestamptz)
    `) as { scope: string; tokens: number | string }[]
    const usage: WindowUsage = { user: 0, global: 0 }
    for (const r of rows) {
      if (r.scope === GLOBAL_SCOPE) usage.global = Number(r.tokens) || 0
      else usage.user = Number(r.tokens) || 0
    }
    return usage
  } catch (error) {
    console.error("[ai-usage] read failed:", error)
    return null
  }
}

/** Adds tokens to the user's and the global current-window rows. false if the write failed. */
export async function recordUsage(
  userId: string,
  tokens: number,
  limits: SpendLimits = readSpendLimits(process.env),
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!(tokens > 0)) return true
  try {
    const u = windowFor(nowMs, limits.userWindowHours)
    const g = windowFor(nowMs, limits.globalWindowHours)
    await sql`
      INSERT INTO ai_token_usage (scope, window_start, window_end, tokens)
      VALUES
        (${userScope(userId)}, ${iso(u.start)}::timestamptz, ${iso(u.end)}::timestamptz, ${tokens}),
        (${GLOBAL_SCOPE}, ${iso(g.start)}::timestamptz, ${iso(g.end)}::timestamptz, ${tokens})
      ON CONFLICT (scope, window_start)
      DO UPDATE SET tokens = ai_token_usage.tokens + EXCLUDED.tokens, updated_at = NOW()
    `
    return true
  } catch (error) {
    console.error("[ai-usage] record failed:", error)
    return false
  }
}

/** Limits, current usage and reset times for one user and site-wide (get_ai_limits). */
export async function getAiLimitStatus(userId: string, nowMs: number = Date.now()) {
  const limits = readSpendLimits(process.env)
  const usage = await readWindowUsage(userId, limits, nowMs)
  const u = windowFor(nowMs, limits.userWindowHours)
  const g = windowFor(nowMs, limits.globalWindowHours)
  return {
    disabled: limits.disabled,
    perRequestTokens: limits.perRequest,
    user: {
      userId,
      limit: limits.userTokens,
      used: usage?.user ?? null,
      windowHours: limits.userWindowHours,
      windowStart: iso(u.start),
      resetAt: iso(u.end),
    },
    global: {
      limit: limits.globalTokens,
      used: usage?.global ?? null,
      windowHours: limits.globalWindowHours,
      windowStart: iso(g.start),
      resetAt: iso(g.end),
    },
    usageReadable: usage !== null,
  }
}
