/**
 * Platform owner gate for operations that act across all users (limit
 * resets). The planner has no platform-admin role (project roles are
 * per-project), so the allowlist is env PLANNER_ADMIN_USER_IDS: a
 * comma-separated list of user ids. Unset or empty = nobody (fails closed).
 */

export function platformAdminIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.PLANNER_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function isPlatformAdmin(userId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return !!userId && platformAdminIds(env).has(userId)
}
