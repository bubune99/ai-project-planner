// npx -y tsx@4.23.15 components/project/opx/doc-slots.assert.ts
import assert from "node:assert/strict"
import { CORE_SLOTS, fillSlots } from "./doc-slots"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const doc = (id: string, title: string, over: Record<string, unknown> = {}) => ({ id, title, ...over })
const of = (r: { name: string; doc: { id: string } | null }[], name: string) => r.find((s) => s.name === name)?.doc?.id ?? null

t("a document titled as a slot fills that slot, whatever its category", () => {
  const r = fillSlots([doc("a", "Design criteria", { category: "design" }), doc("b", "Design system", { category: "design" })])
  assert.equal(of(r, "Design system"), "b")
  assert.equal(of(r, "Design criteria"), "a")
})

t("with only Design criteria written, the Design system slot stays empty rather than taking it", () => {
  const r = fillSlots([doc("a", "Design criteria", { category: "design" })])
  assert.equal(of(r, "Design criteria"), "a")
  assert.equal(of(r, "Design system"), null)
})

t("looser matches still fill a slot nobody is titled for: by words, by category, by type", () => {
  const r = fillSlots([doc("v", "Where this is going", { category: "vision" }), doc("m", "Go-to-market for the spring"), doc("s", "Checkout", { doc_type: "requirements" })])
  assert.equal(of(r, "Vision"), "v"); assert.equal(of(r, "Marketing plan"), "m"); assert.equal(of(r, "Product spec"), "s")
})

t("one document fills one slot; every slot is returned, in order", () => {
  const r = fillSlots([doc("x", "Brand and marketing style guide")])
  assert.equal(r.filter((s) => s.doc).length, 1)
  assert.deepEqual(r.map((s) => s.name), CORE_SLOTS.map((s) => s.name))
})

t("a project's own list of slots is honored, including names that are not defaults", () => {
  const r = fillSlots([doc("p", "Pricing notes"), doc("b", "Business plan")], ["Business plan", "Pricing"])
  assert.deepEqual(r.map((s) => [s.name, s.doc?.id ?? null]), [["Business plan", "b"], ["Pricing", "p"]])
})

console.log(`\n${n} doc-slots checks passed`)
