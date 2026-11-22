/**
 * The database did not answer: one error for it, and one answer to the caller.
 *
 * A lookup that ran and found nothing means "not there" or "not yours". A lookup that threw means
 * nobody knows. Until 2026-11-22 the access helpers turned both into "no access", so during an
 * outage every project route said 404 "Project not found": the person thought the project was
 * gone, and nothing counted as a server error (card ae81c333).
 *
 * The helpers in lib/auth throw DatabaseUnavailableError (through lib/auth/access-outcome.ts).
 * A route that lets it reach its catch answers 500, which is counted and alerted. A route that
 * wants the plain sentence and a retry time puts this first in its catch:
 *
 *   const down = databaseUnavailableResponse(error); if (down) return down
 *
 * No imports, so anything may import it (routes, helpers, the page, check files).
 */

export const DATABASE_UNAVAILABLE_MESSAGE = "The planner cannot reach its database right now. Try again in a minute."
export const DATABASE_UNAVAILABLE_STATUS = 503
export const RETRY_AFTER_SECONDS = 30

export class DatabaseUnavailableError extends Error {
  /** the helper that was asking, for the log line */
  readonly helper: string
  /** what the database client threw; logged where it was caught, never sent to the caller */
  readonly original: unknown
  constructor(helper: string, original: unknown) {
    super(`${helper}: the database did not answer`)
    this.name = "DatabaseUnavailableError"
    this.helper = helper
    this.original = original
  }
}

/** By class, or by name: two copies of this module in one server build must still know each other's error. */
export const isDatabaseUnavailable = (error: unknown): error is DatabaseUnavailableError =>
  error instanceof DatabaseUnavailableError ||
  (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "DatabaseUnavailableError")

/** The 503 for a caller, or null when the error is something else and the route's own catch should answer. */
export function databaseUnavailableResponse(error: unknown): Response | null {
  if (!isDatabaseUnavailable(error)) return null
  return Response.json(
    { error: DATABASE_UNAVAILABLE_MESSAGE },
    { status: DATABASE_UNAVAILABLE_STATUS, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
  )
}
