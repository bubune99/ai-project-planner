// npx -y tsx@4.23.15 lib/graph/ring-layout.assert.ts
import assert from "node:assert/strict"
import { gapOnRing, ringOrder, ringRadii } from "./ring-layout"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }

t("small groups keep the old spacing: 220, then 160 apart", () => {
  assert.deepEqual(ringRadii([1, 2, 2]), [220, 380, 540])
})

t("a ring is large enough for its boxes to sit side by side", () => {
  // The owner's graph on 2026-11-15: 18 ideas and 18 skills shared circles sized for six.
  const counts = [1, 2, 2, 2, 2, 3, 4, 18, 18]
  const radii = ringRadii(counts)
  counts.forEach((c, i) => assert.ok(gapOnRing(radii[i], c) >= 250 - 1, `ring ${i} holds ${c} with ${Math.round(gapOnRing(radii[i], c))} between`))
  for (let i = 1; i < radii.length; i++) assert.ok(radii[i] - radii[i - 1] >= 160, "rings never closer than the step")
  assert.equal(radii[7], 1340)  // seven smaller rings inside it already put it this far out
  // With nothing inside them, two rings of 18 are sized by their boxes: 18 * 250 / (2 * pi) = 716.2
  assert.deepEqual(ringRadii([18, 18]), [717, 877])
})

t("the fewest are innermost; ties keep name order; nothing is lost", () => {
  assert.deepEqual(ringOrder({ idea: 18, todo: 2, decision: 3, document: 2, skill: 18 }), ["document", "todo", "decision", "idea", "skill"])
})

t("an empty or single ring does not divide by nothing", () => {
  assert.deepEqual(ringRadii([]), [])
  assert.deepEqual(ringRadii([0]), [220])
  assert.equal(gapOnRing(220, 1), Infinity)
})

console.log(`\n${n} ring-layout checks passed`)
