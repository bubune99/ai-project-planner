/**
 * The blocker queue's rules (card 570e7e98). Pure: no database, no React, `now` passed in.
 * Check file: blocker-model.assert.ts.
 *
 * A blocker is a card waiting on something: the owner (a question in his inbox), another card, or something
 * outside. The queue puts what waits on the owner first, then the longest waiting; a cleared blocker keeps how it
 * was cleared, by whom and how long it took.
 */
export type WaitingOn = "owner" | "card" | "outside" | "unknown"

export interface Blocker {
  id: string
  stepId: string
  title?: string
  reason: string
  waitingOn: WaitingOn
  raisedAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  resolution?: string | null
}

export const WAITING_ON: readonly WaitingOn[] = ["owner", "card", "outside", "unknown"]

export function waitingOnOf(v: unknown): WaitingOn {
  return WAITING_ON.includes(v as WaitingOn) ? (v as WaitingOn) : "unknown"
}

/** How long, in words a person reads: "2 hours", "3 days". */
export function ageWords(fromIso: string, toMs: number): string {
  const ms = Math.max(0, toMs - Date.parse(fromIso))
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return "less than an hour"
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`
  const d = Math.floor(h / 24)
  return `${d} days`
}

const RANK: Record<WaitingOn, number> = { owner: 0, card: 1, outside: 2, unknown: 3 }

/** Open blockers in the order to deal with them: waiting on the owner first, then the longest waiting. */
export function queueOrder(blockers: Blocker[]): Blocker[] {
  return blockers
    .filter((b) => !b.resolvedAt)
    .slice()
    .sort((a, b) => RANK[a.waitingOn] - RANK[b.waitingOn] || Date.parse(a.raisedAt) - Date.parse(b.raisedAt))
}

/** One line for a card: "Blocked 3 days, waiting on you: the Stripe key". */
export function blockerLine(b: Blocker, nowMs: number): string {
  const on = b.waitingOn === "owner" ? ", waiting on you" : b.waitingOn === "card" ? ", waiting on another card" : b.waitingOn === "outside" ? ", waiting on someone outside" : ""
  return `Blocked ${ageWords(b.raisedAt, nowMs)}${on}: ${b.reason}`
}

/** How cleared blockers went: how many, and the middle time to clear one, in hours. */
export function clearedSummary(blockers: Blocker[]): { cleared: number; medianHours: number | null } {
  const hours = blockers
    .filter((b) => b.resolvedAt)
    .map((b) => (Date.parse(b.resolvedAt as string) - Date.parse(b.raisedAt)) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b)
  if (!hours.length) return { cleared: 0, medianHours: null }
  const mid = Math.floor(hours.length / 2)
  const median = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2
  return { cleared: hours.length, medianHours: Math.round(median * 10) / 10 }
}
