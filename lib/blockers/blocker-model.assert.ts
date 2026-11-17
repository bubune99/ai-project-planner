/* Run: npx -y tsx@4.23.15 lib/blockers/blocker-model.assert.ts */
import { ageWords, blockerLine, clearedSummary, queueOrder, waitingOnOf, type Blocker } from "./blocker-model"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}
const now = Date.parse("2026-11-17T12:00:00Z")
const b = (id: string, waitingOn: Blocker["waitingOn"], raisedAt: string, extra: Partial<Blocker> = {}): Blocker => ({ id, stepId: `s${id}`, reason: `r${id}`, waitingOn, raisedAt, ...extra })

eq(ageWords("2026-11-17T11:30:00Z", now), "less than an hour", "under an hour")
eq(ageWords("2026-11-17T11:00:00Z", now), "1 hour", "one hour, singular")
eq(ageWords("2026-11-16T00:00:00Z", now), "36 hours", "under two days in hours")
eq(ageWords("2026-11-14T12:00:00Z", now), "3 days", "days after two")
eq(ageWords("2026-11-18T12:00:00Z", now), "less than an hour", "a clock ahead never goes negative")

const q = queueOrder([
  b("1", "outside", "2026-11-01T00:00:00Z"),
  b("2", "owner", "2026-11-16T00:00:00Z"),
  b("3", "owner", "2026-11-10T00:00:00Z"),
  b("4", "card", "2026-11-02T00:00:00Z"),
  b("5", "owner", "2026-11-01T00:00:00Z", { resolvedAt: "2026-11-02T00:00:00Z" }),
])
eq(q.map((x) => x.id), ["3", "2", "4", "1"], "waiting on the owner first, oldest first within; cleared ones are not in the queue")

eq(blockerLine(b("6", "owner", "2026-11-14T12:00:00Z", { reason: "the Stripe key" }), now), "Blocked 3 days, waiting on you: the Stripe key", "the line for a card")
eq(blockerLine(b("7", "unknown", "2026-11-17T11:00:00Z", { reason: "No reason given" }), now), "Blocked 1 hour: No reason given", "no waiting-on words when it is not known")

eq(clearedSummary([b("a", "owner", "2026-11-01T00:00:00Z", { resolvedAt: "2026-11-01T02:00:00Z" }), b("b", "card", "2026-11-01T00:00:00Z", { resolvedAt: "2026-11-01T10:00:00Z" }), b("c", "card", "2026-11-01T00:00:00Z")]), { cleared: 2, medianHours: 6 }, "median time to clear over cleared ones only")
eq(clearedSummary([]), { cleared: 0, medianHours: null }, "nothing cleared yet")
eq(waitingOnOf("owner"), "owner", "a known kind is kept")
eq(waitingOnOf("the moon"), "unknown", "anything else is unknown")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
