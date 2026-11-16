import assert from "node:assert/strict"
import { checkMarker, failedCheckCard, walkErrorCard, walkMarker } from "./check-card"

let n = 0
const t = (name: string, f: () => void) => { f(); n++; console.log("ok", name) }

t("a failed check becomes a fix card carrying its marker", () => {
  const c = failedCheckCard({ checklistId: "cl1", route: "/inbox", key: "inbox.send@phone", note: "Send is cut off at 390px\nmore detail", actor: "reviewer", build: "abcdef123" })
  assert.equal(c.title, "Fix: Send is cut off at 390px")
  assert.deepEqual(c.tags, ["check", "fix"])
  assert.ok(c.description.endsWith(checkMarker("cl1", "inbox.send@phone")))
  assert.match(c.description, /build abcdef1/)
  assert.equal(c.marker, "check: cl1#inbox.send@phone")
})

t("long notes are clipped in the title, kept whole in the description", () => {
  const note = "x".repeat(400)
  const c = failedCheckCard({ checklistId: "c", route: "/", key: "k", note, actor: "builder" })
  assert.equal(c.title.length, 180)
  assert.ok(c.description.includes(note))
})

t("a walk error uses the walk-finding marker the owner's 'do' already uses", () => {
  const c = walkErrorCard({ key: "f1", what: "Search box does not search", goal: "find a card", suggest: "search tasks" })
  assert.equal(c.marker, walkMarker("f1"))
  assert.equal(c.marker, "walk-finding: f1")
  assert.match(c.description, /What would help: search tasks/)
  assert.deepEqual(c.tags, ["from-walk", "fix"])
})

console.log(`\n${n} check-card checks passed`)
