/**
 * Request limits for the routes that answer without a signed-in caller and had none
 * (owner, 2026-11-22, planner question d1c10394: "Declare all six public, with the tightenings").
 * Per address, counted by lib/rate-limit.ts. POST /api/oauth/register keeps its own limit (10 an hour).
 *
 * Pure: the numbers and the counter keys only. Checked by public-route-limits.assert.ts.
 *
 * Why these numbers
 * - health: an uptime checker asks once a minute. 60 a minute leaves room for several monitors behind one
 *   address, each asking every few seconds, and still stops a loop.
 * - invitation: a person opens the link once; the page asks once per load. 30 a minute covers reloads and
 *   several invited people behind one office address.
 * - oauthToken: a connector exchanges one code per connection. 30 a minute covers retries and a shared
 *   connector address; the code itself is still single use.
 */

const MINUTE_MS = 60_000

export const PUBLIC_ROUTE_LIMITS = {
  health: { prefix: "public-health", limit: 60, windowMs: MINUTE_MS },
  invitation: { prefix: "public-invitation", limit: 30, windowMs: MINUTE_MS },
  oauthToken: { prefix: "oauth-token", limit: 30, windowMs: MINUTE_MS },
} as const

export type PublicRoute = keyof typeof PUBLIC_ROUTE_LIMITS

/**
 * Counter key for one route and one address. The address comes last, so an owner reset by address
 * (resetLimits in lib/rate-limit.ts) finds it. A missing address counts as one shared caller.
 */
export function publicLimitKey(route: PublicRoute, address: string): string {
  return `${PUBLIC_ROUTE_LIMITS[route].prefix}:${address || "unknown"}`
}
