// npx -y tsx@4.23.15 lib/people/branches.assert.ts
import assert from "node:assert/strict"
import { allSteps, branchLayout, isChoice, pathsOf } from "./branches"
import type { Step } from "./people-model"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const st = (id: string, extra: Record<string, unknown> = {}): Step => ({ id, does: id, expects: "", data: "", ref: null, ...extra } as Step)
// The owner's example: at check out the person pays, or leaves the cart.
const shop = { name: "Buy a shirt", steps: [
  st("browse"), st("cart"),
  st("checkout", { ways: [
    { id: "pay", label: "Pays", ends: false, steps: [st("card"), st("confirm")] },
    { id: "leave", label: "Leaves the cart", ends: true, steps: [] },
  ] }),
  st("receipt"),
] }

t("a step with two ways is a choice; a plain step is not", () => {
  assert.equal(isChoice(shop.steps[2]), true)
  assert.equal(isChoice(shop.steps[0]), false)
  assert.equal(isChoice(st("x", { ways: [{ id: "a", label: "A", ends: false, steps: [] }] })), false)
})

t("every step, ways included, in reading order", () => {
  assert.deepEqual(allSteps(shop).map((s) => s.id), ["browse", "cart", "checkout", "card", "confirm", "receipt"])
})

t("each way is a path to walk: paying goes to the receipt, leaving stops at the cart", () => {
  const p = pathsOf(shop)
  assert.equal(p.length, 2)
  assert.deepEqual(p[0].steps.map((s) => s.id), ["browse", "cart", "checkout", "card", "confirm", "receipt"]); assert.equal(p[0].ends, "done")
  assert.equal(p[1].name, "Buy a shirt: Leaves the cart")
  assert.deepEqual(p[1].steps.map((s) => s.id), ["browse", "cart", "checkout"]); assert.equal(p[1].ends, "left")
})

t("a use case without choices is one path, unchanged", () => {
  const plain = { name: "Plain", steps: [st("a"), st("b")] }
  assert.deepEqual(pathsOf(plain).map((p) => p.steps.map((s) => s.id)), [["a", "b"]])
  assert.equal(branchLayout(plain).joins.length, 1)
})

t("two choices give one path per way after the first, each taking first ways elsewhere", () => {
  const two = { name: "T", steps: [
    st("a", { ways: [{ id: "a1", label: "A1", ends: false, steps: [st("a1s")] }, { id: "a2", label: "A2", ends: false, steps: [st("a2s")] }] }),
    st("b", { ways: [{ id: "b1", label: "B1", ends: false, steps: [] }, { id: "b2", label: "B2", ends: true, steps: [st("b2s")] }, { id: "b3", label: "B3", ends: false, steps: [st("b3s")] }] }),
    st("c"),
  ] }
  const p = pathsOf(two)
  assert.equal(p.length, 1 + 1 + 2)
  assert.deepEqual(p.map((x) => x.steps.map((s) => s.id).join(" ")), ["a a1s b c", "a a2s b c", "a a1s b b2s", "a a1s b b3s c"])
})

t("the drawing: the main line on top, the other way in its own lane, the main line resumes after the longest way", () => {
  const L = branchLayout(shop, { w: 100, h: 100, gapX: 10, gapY: 10 })
  const at = (k: string) => L.boxes.find((b) => b.key === k)!
  assert.deepEqual([at("checkout").x, at("checkout").y], [220, 0])
  assert.deepEqual([at("card").x, at("card").y], [330, 0])
  assert.deepEqual([at("end:leave").x, at("end:leave").y], [330, 110])
  assert.equal(at("receipt").x, 550)                          // after the two steps of "Pays"
  const lab = L.joins.filter((j) => j.label).map((j) => `${j.from}>${j.to}:${j.label}`)
  assert.deepEqual(lab, ["checkout>card:Pays", "checkout>end:leave:Leaves the cart"])
  assert.ok(L.joins.some((j) => j.from === "confirm" && j.to === "receipt"))
  assert.ok(!L.joins.some((j) => j.from === "end:leave"), "a way that ends does not rejoin")
  assert.equal(new Set(L.boxes.map((b) => `${b.x},${b.y}`)).size, L.boxes.length, "no two boxes share a place")
})

console.log(`\n${n} branch checks passed`)
