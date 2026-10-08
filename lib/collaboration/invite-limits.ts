/**
 * Invitation send limits. Every invitation can send an email
 * (createInvitation -> sendInvitationEmail), so creating them is capped:
 *
 *   per inviting user   20 / hour and 50 / day (Postgres counters, lib/rate-limit.ts)
 *   per project         at most 50 pending, unexpired invitations
 *
 * Fails closed: if the counters or the pending count cannot be read, the
 * invitation is refused.
 */

import { sql } from "@/lib/db/client"
import { checkRateLimit, DAY_MS, HOUR_MS } from "@/lib/rate-limit"

export const INVITES_PER_HOUR = 20
export const INVITES_PER_DAY = 50
export const MAX_PENDING_INVITES_PER_PROJECT = 50

export type InviteLimitResult = { ok: true } | { ok: false; status: 429 | 503; message: string }

export async function checkInviteLimits(userId: string, projectId: string): Promise<InviteLimitResult> {
  if (!(await checkRateLimit(`invite-hour:${userId}`, INVITES_PER_HOUR, HOUR_MS))) {
    return { ok: false, status: 429, message: `Invitation limit reached (${INVITES_PER_HOUR} per hour). Try again later.` }
  }
  if (!(await checkRateLimit(`invite-day:${userId}`, INVITES_PER_DAY, DAY_MS))) {
    return { ok: false, status: 429, message: `Invitation limit reached (${INVITES_PER_DAY} per day). Try again tomorrow.` }
  }
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS pending FROM project_invitations
      WHERE project_id = ${projectId} AND status = 'pending' AND expires_at > NOW()
    `) as { pending: number }[]
    if ((rows[0]?.pending ?? 0) >= MAX_PENDING_INVITES_PER_PROJECT) {
      return {
        ok: false,
        status: 429,
        message: `This project already has ${MAX_PENDING_INVITES_PER_PROJECT} pending invitations. Revoke some before sending more.`,
      }
    }
  } catch (error) {
    console.error("[invite-limits] pending count failed:", error)
    return { ok: false, status: 503, message: "Invitations are unavailable right now. Try again shortly." }
  }
  return { ok: true }
}
