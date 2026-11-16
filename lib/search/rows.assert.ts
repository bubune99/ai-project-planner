import assert from "node:assert/strict"
import { searchRows } from "./rows"

let n = 0
const t = (name: string, f: () => void) => { f(); n++; console.log("ok", name) }
const pages: [string, { title: string; sub: string }][] = [["/inbox", { title: "Inbox", sub: "Questions waiting on you" }]]

t("pages, then found things by kind, then ask", () => {
  const r = searchRows("stripe", pages, {
    tasks: [{ id: "s1", title: "Register Stripe webhook", projectName: "BYB", url: "/project/p1?tab=tasks&step=s1" }],
    projects: [{ id: "p1", title: "BYB" }],
    documents: [{ id: "d1", title: "Stripe notes", projectName: "BYB", category: "spec", url: "/project/p1?tab=docs&doc=d1" }],
  })
  assert.deepEqual(r.map((x) => x.group), ["Pages", "Projects", "Tasks", "Documents", "Assistant"])
  assert.equal((r[1] as any).href, "/project/p1")
  assert.equal((r[2] as any).href, "/project/p1?tab=tasks&step=s1")
  assert.equal(r[3].sub, "BYB · spec")
  assert.deepEqual(r[4], { key: "ask", group: "Assistant", title: "Ask the assistant: “stripe”", sub: "Finds it or does it for you", ask: "stripe" })
})

t("nothing typed: no ask row", () => {
  assert.equal(searchRows("  ", pages, null).some((x) => x.key === "ask"), false)
})

t("a decision without a project, or anything without a title, is left out", () => {
  const r = searchRows("x", [], { decisions: [{ id: "d", title: "Pick" }], ideas: [{ id: "i", title: null }] })
  assert.deepEqual(r.map((x) => x.key), ["ask"])
})

t("each group is capped", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, title: `T${i}`, url: `/x/${i}` }))
  assert.equal(searchRows("t", [], { tasks: many }, 5).filter((x) => x.group === "Tasks").length, 5)
})

console.log(`\n${n} search row checks passed`)
