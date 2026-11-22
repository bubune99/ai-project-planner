/**
 * What an access lookup may conclude.
 *
 * The rule: a query that ran and found nothing is "no access". A query that threw is "unknown",
 * never "no access". On "unknown" the helper logs what was thrown, with its own name, and throws
 * DatabaseUnavailableError (lib/db/unavailable.ts) so the route answers as a failure of ours
 * instead of "Project not found" (card ae81c333).
 *
 * One case is settled before the database is asked: an id that is not shaped like a uuid can
 * never name a row, and the database refuses it by throwing. That is "no access" (as it was
 * before, when the throw was swallowed), not an outage.
 *
 * Pure: the lookup and the log are passed in.
 */
import { isUuid } from "../api/ids"
import { DatabaseUnavailableError } from "../db/unavailable"

export type Attempt = { ran: true; found: boolean } | { ran: false; error: unknown }
export type Outcome = "access" | "no-access" | "unknown"

export function outcomeOf(attempt: Attempt): Outcome {
  if (!attempt.ran) return "unknown"
  return attempt.found ? "access" : "no-access"
}

type Log = (message: string, error: unknown) => void
const toConsole: Log = (message, error) => console.error(message, error)

/** Run a lookup. What it returns is the answer; if it throws, the answer is unknown and the typed error is thrown. */
export async function answered<T>(helper: string, run: () => Promise<T>, log: Log = toConsole): Promise<T> {
  try {
    return await run()
  } catch (error) {
    log(`[access] ${helper}: the lookup threw, so access is unknown (answered as a failure of ours, not as "not found")`, error)
    throw new DatabaseUnavailableError(helper, error)
  }
}

/** The same, for a lookup by a row id: an id that cannot name a row is `noAccess` without asking. */
export async function lookedUp<T>(helper: string, resourceId: unknown, noAccess: T, run: () => Promise<T>, log: Log = toConsole): Promise<T> {
  if (!isUuid(resourceId)) return noAccess
  return answered(helper, run, log)
}
