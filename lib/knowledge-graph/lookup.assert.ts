import assert from "node:assert/strict"
import { ENTITY_LOOKUP, nodeQuery, placeholderNode, toNode } from "./lookup"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

ok("every lookup is tied to the caller ($2) and to one id ($1)", () => {
  for (const type of Object.keys(ENTITY_LOOKUP)) {
    const q = nodeQuery(type)!
    assert.match(q.text, /WHERE t\.id = \$1 AND /, type)
    assert.match(q.text, /user_id(::text)? = \$2/, type)
    assert.match(q.text, /LIMIT 1$/, type)
  }
})

ok("no lookup can be built from request text", () => {
  assert.equal(nodeQuery("users; DROP TABLE x"), null)
  assert.equal(nodeQuery("__proto__"), null)
  assert.equal(nodeQuery("constructor"), null)
  assert.equal(toNode("constructor", "abcdefgh-1", { title: "x" }).title, "constructor abcdefgh")
  for (const l of Object.values(ENTITY_LOOKUP)) {
    for (const name of [l.table, l.titleCol, l.summaryCol, ...(l.extraCols ?? [])]) if (name) assert.match(name, /^[a-z_]+$/)
  }
})

ok("items owned through a parent check the parent's owner", () => {
  assert.match(nodeQuery("decision")!.text, /project_id IN \(SELECT id FROM projects WHERE user_id = \$2\)/)
  assert.match(nodeQuery("idea_facet")!.text, /idea_id IN \(SELECT id FROM ideas WHERE user_id = \$2\)/)
  assert.match(nodeQuery("work_order_step")!.text, /work_order_id IN \(SELECT id FROM work_orders WHERE user_id = \$2\)/)
})

ok("no row gives a placeholder with no details", () => {
  const node = toNode("idea", "12345678-aaaa-bbbb-cccc-000000000000", undefined)
  assert.deepEqual(node, placeholderNode("idea", "12345678-aaaa-bbbb-cccc-000000000000"))
  assert.equal(node.title, "idea 12345678")
  assert.equal(node.summary, undefined)
})

ok("a row becomes a node with title, summary and extras", () => {
  const node = toNode("sop", "id-1", { title: "Ship a release", content: "Steps", status: "active", category: "Ops" })
  assert.equal(node.title, "Ship a release")
  assert.equal(node.summary, "Steps")
  assert.deepEqual(node.metadata, { status: "active", category: "Ops" })
  assert.equal(toNode("client", "id-2", { name: "", notes: null }).title, "(untitled client)")
})

ok("an unknown type is a placeholder", () => {
  assert.equal(toNode("mystery", "abcdefgh-1", { title: "x" }).title, "mystery abcdefgh")
})

console.log(`\n${n} checks passed`)
