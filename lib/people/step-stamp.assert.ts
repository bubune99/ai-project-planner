// npx -y tsx@4.23.15 lib/people/step-stamp.assert.ts
import assert from "node:assert/strict"
import { stampChangedSteps } from "./step-stamp"
import type { FlowDoc, Step } from "./people-model"

let n = 0
const t = (_name: string, fn: () => void) => { fn(); n++ }
const step = (id: string, over: Partial<Step> = {}): Step => ({ id, does: `do ${id}`, expects: "e", data: "", ref: { route: "/", view: "page", kind: "Button", label: id }, ...over })
const doc = (steps: Step[], flows = [{ id: "u1", who: "p1", name: "U", lens: "", steps }]): FlowDoc => ({ people: [], personas: [], flows, areas: [] })
const NOW = "2026-11-24T12:00:00.000Z", EARLIER = "2026-11-20T00:00:00.000Z"

t("an unchanged step keeps what was stored; the sender's time is not trusted", () => {
  const before = doc([step("a", { changedAt: EARLIER }), step("b")])
  const out = stampChangedSteps(before, doc([step("a", { changedAt: "2030-01-01T00:00:00.000Z" }), step("b", { changedAt: "2030-01-01T00:00:00.000Z" })]), NOW)
  assert.equal(out.flows[0].steps[0].changedAt, EARLIER)
  assert.equal(out.flows[0].steps[1].changedAt, undefined)
})

t("added, reworded and re-pointed steps are stamped; a note or content is not a change to walk", () => {
  const before = doc([step("a"), step("b"), step("c"), step("d")])
  const out = stampChangedSteps(before, doc([step("a", { does: "press it now" }), step("b", { ref: null }), step("c", { note: "n", data: "x" }), step("d"), step("e")]), NOW).flows[0].steps
  assert.deepEqual(out.map((s) => s.changedAt ?? "-"), [NOW, NOW, "-", "-", NOW])
})

t("steps on a way are stamped the same way", () => {
  const before = doc([step("a", { ways: [{ id: "w", label: "W", ends: true, steps: [step("r")] }] })])
  const out = stampChangedSteps(before, doc([step("a", { ways: [{ id: "w", label: "W", ends: true, steps: [step("r", { expects: "other" }), step("r2")] }] })]), NOW)
  assert.deepEqual(out.flows[0].steps[0].ways![0].steps.map((s) => s.changedAt), [NOW, NOW])
  assert.equal(out.flows[0].steps[0].changedAt, undefined)
})

t("a use case new as a whole is not stamped: never walked already says it", () => {
  const out = stampChangedSteps(doc([]), doc([step("a")], [{ id: "u2", who: "p1", name: "New", lens: "", steps: [step("a")] }]), NOW)
  assert.equal(out.flows[0].steps[0].changedAt, undefined)
})

t("the original documents are not changed", () => {
  const before = doc([step("a")]), after = doc([step("a", { does: "x" })])
  stampChangedSteps(before, after, NOW)
  assert.equal(after.flows[0].steps[0].changedAt, undefined)
})

console.log(`step-stamp: ${n} groups of checks passed`)
