import assert from "node:assert/strict"
import { evaluationCard, evaluationMarker } from "./evaluation-card"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok   ${name}`) }

t("a report of something broken asks which check missed it, on its page", () => {
  const c = evaluationCard({ reportId: "r1", kind: "wrong", title: "Card menu jumps the page", route: "/project/p1", comment: "The page jumped   when I opened\nthe menu" })
  assert.equal(c.title, "Why did the checks miss it: Card menu jumps the page")
  assert.match(c.description, /found something broken on \/project\/p1 that our checks passed/)
  assert.match(c.description, /"The page jumped when I opened the menu"/)
  assert.match(c.description, /Which check should have caught it/)
  assert.match(c.description, /Rescan on \/project\/p1/)
  assert.ok(c.description.endsWith(evaluationMarker("r1")))
  assert.deepEqual(c.tags, ["evaluation", "check"])
})

t("a wish asks which planning question missed it", () => {
  const c = evaluationCard({ reportId: "r2", kind: "wish", title: "Export to CSV", comment: "I want to export" })
  assert.match(c.description, /asked for something that the plan did not have/)
  assert.match(c.description, /Which question in the plan/)
  assert.match(c.description, /Rescan the page/)
})

t("long titles and words are cut, not overflowing", () => {
  const c = evaluationCard({ reportId: "r3", kind: "wrong", title: "x".repeat(400), comment: "y".repeat(600) })
  assert.ok(c.title.length <= 180)
  assert.ok(c.description.includes("…"))
})

console.log(`\n${n} evaluation card checks passed`)
