/**
 * Which board column a new card starts in. Pure; checked by column.assert.ts.
 *
 * Owner 2026-11-16: "I don't think all 84 of those should be in up next right now", so new work waits in Requests.
 * Owner 2026-11-19: "we are still creating tasks and putting them in feature request as default when sometimes it's
 * meant to go in up next". So the column follows what the card is:
 *   fix        something found broken: Up next (pending)
 *   asked_now  the owner asked for it now, in their words: Up next (pending)
 *   idea       a feature, an improvement, a thought for later: Requests (requested)
 * A status given outright always wins. With no kind, a title that names a fault ("Fix: ...", "... is broken") is a fix.
 */

export type CardKind = "fix" | "asked_now" | "idea"
export const CARD_KINDS: readonly CardKind[] = ["fix", "asked_now", "idea"]

const FAULT = /^\s*(fix|bug|broken|error|regression)\b|\b(is broken|does not work|doesn't work|never (opens|saves|loads|shows))\b/i

export function startingColumn(a: { status?: string | null; kind?: CardKind | null; title: string }): string {
  if (a.status) return a.status
  if (a.kind === "fix" || a.kind === "asked_now") return "pending"
  if (a.kind === "idea") return "requested"
  return FAULT.test(a.title) ? "pending" : "requested"
}
