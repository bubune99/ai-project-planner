import assert from "node:assert/strict"
import { lessons, lessonsLine, parseChange, parseVerdict, type StoredChange } from "./change-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const good = { title: "The figure in the budget rings can be read", why: "The inner rings were drawn over it. Found by the scan, confirmed on a screenshot.", route: "/app", checkKey: "50|Read it|Default", stage: "production", build: "9e9efed" }

ok("a sound change is read back unchanged", () => {
  assert.deepEqual(parseChange(JSON.parse(JSON.stringify(good))), { change: good, errors: [] })
})

ok("a change must say what it is, what it answers and where the after picture is from", () => {
  const e = parseChange({ stage: "somewhere" }).errors
  assert.equal(e.length, 3)
  assert.ok(e[0].includes("needs a title")); assert.ok(e[1].includes("what it answers")); assert.ok(e[2].includes("mock, staging or production"))
  assert.equal("evil" in parseChange({ ...good, evil: 1 }).change, false)
})

ok("only good or not good counts as a judgment, and not good has to say why", () => {
  assert.deepEqual(parseVerdict({ verdict: "good" }), { verdict: "good", note: "", errors: [] })
  assert.ok(parseVerdict({ verdict: "fine" }).errors[0].includes("good or not"))
  assert.ok(parseVerdict({ verdict: "bad", note: "  " }).errors[0].includes("what was wrong"))
  assert.deepEqual(parseVerdict({ verdict: "bad", note: " The rings are too thin  now " }), { verdict: "bad", note: "The rings are too thin now", errors: [] })
})

const S = (id: string, more: Partial<StoredChange>): StoredChange => ({ ...(good as StoredChange), id, at: "2026-11-14T10:00:00Z", actor: "agent", ...more })
ok("what the owner said adds up to lessons, newest first", () => {
  const l = lessons([S("a", {}), S("b", { verdict: "good", decidedAt: "2026-11-14T11:00:00Z" }), S("c", { verdict: "bad", note: "Too thin", decidedAt: "2026-11-14T12:00:00Z", title: "Thinner rings" }), S("d", { verdict: "good", note: "Much clearer", decidedAt: "2026-11-14T13:00:00Z" })])
  assert.deepEqual([l.waiting, l.good, l.bad], [1, 2, 1])
  assert.deepEqual(l.said.map((s) => [s.verdict, s.note]), [["good", "Much clearer"], ["bad", "Too thin"]])
  assert.equal(lessonsLine(l), "1 waiting for the owner to look at. Of 3 judged, 2 good and 1 not.")
  assert.equal(lessonsLine(lessons([])), "No changes have been recorded yet.")
  assert.equal(lessonsLine(lessons([S("a", {})])), "1 waiting for the owner to look at. None judged yet.")
})

console.log(`\n${n} checks passed`)
