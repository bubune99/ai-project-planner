import assert from "node:assert/strict"
import { needsYou, needsYouLine } from "./needs-you"
import type { InboxItem } from "../inbox"
import type { StoredWalk } from "../walks/walk-model"

const q = (id: string, projectId: string | null, askedAt: string): InboxItem => ({ id, kind: "question", question: id, options: [], context: null, projectId, projectName: null, stepId: null, askedBy: "claude-code", askedAt })
const walk = (id: string, at: string, outcome: StoredWalk["outcome"], findings: StoredWalk["findings"], scores?: StoredWalk["scores"]): StoredWalk =>
  ({ id, at, actor: "agent", goal: `goal ${id}`, cold: true, outcome, steps: [], findings, ...(scores ? { scores } : {}), ...(outcome === "reached" ? {} : { why: "stopped" }) })

const y = needsYou("p1", {
  inbox: [q("b", "p1", "2026-11-14T10:00:00Z"), q("other", "p2", "2026-11-14T09:00:00Z"), q("a", "p1", "2026-11-14T08:00:00Z"), q("none", null, "2026-11-14T07:00:00Z")],
  changes: [{ id: "c1", title: "Rings", stage: "staging", at: "2026-11-14T01:00:00Z" }, { id: "c2", title: "Old", stage: "staging", at: "2026-11-13T01:00:00Z", verdict: "good" }, { id: "c3", title: "Labels", stage: "mock", at: "2026-11-14T02:00:00Z" }],
  walks: [
    walk("w1", "2026-11-14T03:00:00Z", "blocked", [{ kind: "error", what: "Live payments on staging" }, { kind: "friction", what: "Prices read as cost prices" }, { kind: "friction", what: "Cannot find the order", lens: "find" }], { find: { score: 1, note: "no way in" } }),
    walk("w2", "2026-11-14T04:00:00Z", "reached", [{ kind: "taste", what: "Reply time is a promise" }, { kind: "gap", what: "No tracking" }, { kind: "error", what: "live payments on staging" }]),
  ],
})
// 1. only this project's questions, newest first (owner, 2026-11-14: "newer items should appear towards the top")
assert.deepEqual(y.questions.map((x) => x.id), ["b", "a"])
// 2. only changes without a verdict, newest first
assert.deepEqual(y.changes.map((x) => x.id), ["c3", "c1"])
// 3. taste and friction above the line are the owner's; errors, gaps and friction scored below 3 are the agents'
assert.deepEqual(y.yours.map((f) => f.what).sort(), ["Prices read as cost prices", "Reply time is a promise"])
assert.deepEqual(y.agents.map((f) => f.what).sort(), ["Cannot find the order", "No tracking", "live payments on staging"])
// 4. the count is what needs an answer or a judgment, never the agents' work
assert.equal(y.count, 2 + 2 + 2)
assert.deepEqual(y.walks, { total: 2, reached: 1, stopped: 1 })
// 5. the sentence
assert.equal(needsYouLine(y), "2 questions to answer, 2 changes to judge and 2 findings that are your call.")
const none = needsYou("p9", { inbox: [], changes: [], walks: [] })
assert.equal(none.count, 0)
assert.equal(needsYouLine(none), "Nothing is waiting on you.")
assert.equal(needsYouLine(needsYou("p1", { inbox: [q("a", "p1", "x")], changes: [], walks: [] })), "1 question to answer.")
// 6. cards only the owner can do: open ones listed and counted, finished and other kinds left out
const withCards = needsYou("p1", { inbox: [], changes: [], walks: [], cards: [
  { id: "k1", title: "Add the Stripe key", status: "pending", work_kind: "owner" },
  { id: "k2", title: "Done already", status: "completed", work_kind: "owner" },
  { id: "k3", title: "Agent work", status: "pending", work_kind: "task" },
] })
assert.deepEqual(withCards.cards, [{ id: "k1", title: "Add the Stripe key" }])
assert.equal(withCards.count, 1)
assert.equal(needsYouLine(withCards), "1 thing only you can do.")
console.log("needs-you: 6 groups of checks pass")
