/**
 * What an API answer may say about a failure. Pure: no request, no response, no logging.
 *
 * Two kinds of error reach a route's catch. One this app wrote for the person ("Send the guide's id", "Someone saved
 * before you"): they need that sentence, word for word. The other came from the database or a library ("column
 * ps.due_date does not exist"): that text is for the server log, and the person gets the route's own plain sentence.
 *
 * Check: npx -y tsx@4.23.15 lib/api/error-text.assert.ts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErrorKind<E extends Error> = abstract new (...args: any[]) => E

/**
 * The error itself when it is one of the kinds this route names as written for the person, otherwise null.
 * Naming Error itself would let every database and library error through, so it never matches.
 */
export function ownError<E extends Error>(error: unknown, ...kinds: ErrorKind<E>[]): E | null {
  for (const kind of kinds) {
    if ((kind as unknown) === Error) continue
    if (error instanceof kind) return error
  }
  return null
}

/**
 * The details an error answer may carry. A failure on our side (500 and up) carries none: whatever came with it is
 * the database's or a library's text. Below 500 the details say what was wrong with the request and are kept, but a
 * raw error is never sent.
 */
export function detailsForCaller(status: number, details: unknown): unknown {
  if (details == null || details instanceof Error) return undefined
  if (!(status < 500)) return undefined
  return details
}
