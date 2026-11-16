import assert from "node:assert/strict"
import { linkParts, questionHrefs } from "./links"

let n = 0
const t = (name: string, f: () => void) => { f(); n++; console.log("ok", name) }

t("project and card links", () => {
  assert.deepEqual(questionHrefs({ projectId: "p1", stepId: "s1" }), { project: "/project/p1", card: "/project/p1?tab=tasks&step=s1" })
  assert.deepEqual(questionHrefs({ projectId: "p1", stepId: null }), { project: "/project/p1", card: null })
  assert.deepEqual(questionHrefs({ projectId: null, stepId: "s1" }), { project: null, card: null })
})

t("web addresses become links, without trailing punctuation", () => {
  const p = linkParts("See https://example.com/a?b=1. Then decide.")
  assert.deepEqual(p, [{ text: "See " }, { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1", external: true }, { text: ". Then decide." }])
})

t("planner paths become links; other slashes do not", () => {
  const p = linkParts("Open /project/abc?tab=tasks, not and/or 1/2.")
  assert.equal(p.filter((x) => "href" in x).length, 1)
  assert.deepEqual(p[1], { text: "/project/abc?tab=tasks", href: "/project/abc?tab=tasks", external: false })
})

t("agent tokens are not shown", () => {
  assert.deepEqual(linkParts("Pick one [gate-plan:123] please"), [{ text: "Pick one please" }])
})

t("plain text stays one part", () => {
  assert.deepEqual(linkParts("No links here."), [{ text: "No links here." }])
})

console.log(`\n${n} inbox link checks passed`)
