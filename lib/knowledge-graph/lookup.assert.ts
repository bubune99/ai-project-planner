import assert from "node:assert/strict"
import { ENTITY_LOOKUP, nodeQueries, placeholderNode, toNode } from "./lookup"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

ok("every lookup is tied to the caller ($2) and to one id ($1)", () => {
  for (const type of Object.keys(ENTITY_LOOKUP)) {
    const qs = nodeQueries(type)
    assert.ok(qs.length >= 1, type)
    for (const q of qs) {
      assert.match(q.text, /WHERE t\.id = \$1 AND /, type)
      assert.match(q.text, /user_id(::text)? = \$2/, type)
      assert.match(q.text, /LIMIT 1$/, type)
    }
  }
})

ok("no lookup can be built from request text", () => {
  assert.deepEqual(nodeQueries("users; DROP TABLE x"), [])
  assert.deepEqual(nodeQueries("__proto__"), [])
  assert.deepEqual(nodeQueries("constructor"), [])
  for (const l of Object.values(ENTITY_LOOKUP)) {
    for (const name of [l.table, l.titleCol, l.summaryCol, ...(l.extraCols ?? [])]) if (name) assert.match(name, /^[a-z_]+$/)
  }
})

ok("items owned through a parent check the parent's owner", () => {
  assert.match(nodeQueries("adr")[0].text, /project_id IN \(SELECT id FROM projects WHERE user_id = \$2\)/)
  assert.match(nodeQueries("idea_facet")[0].text, /idea_id IN \(SELECT id FROM ideas WHERE user_id = \$2\)/)
  assert.match(nodeQueries("work_order_step")[0].text, /work_order_id IN \(SELECT id FROM work_orders WHERE user_id = \$2\)/)
  assert.match(nodeQueries("document")[0].text, /\(t\.user_id = \$2 OR t\.project_id IN \(SELECT id FROM projects WHERE user_id = \$2\)\)/)
})

ok("a decision is looked up in the decisions table, then the ADR table", () => {
  for (const type of ["decision", "architecture_decision"]) {
    assert.deepEqual(nodeQueries(type).map((q) => q.lookup.table), ["mlp_why_decisions", "architecture_decisions"])
  }
})

ok("no row gives a placeholder with no details", () => {
  const id = "12345678-aaaa-bbbb-cccc-000000000000"
  const node = toNode("idea", id, ENTITY_LOOKUP.idea, undefined)
  assert.deepEqual(node, placeholderNode("idea", id))
  assert.equal(node.title, "idea 12345678")
  assert.equal(node.summary, undefined)
})

ok("a row becomes a node with title, summary and extras", () => {
  const node = toNode("sop", "id-1", ENTITY_LOOKUP.sop, { title: "Ship a release", content: "Steps", status: "active", category: "Ops" })
  assert.equal(node.title, "Ship a release")
  assert.equal(node.summary, "Steps")
  assert.deepEqual(node.metadata, { status: "active", category: "Ops" })
  assert.equal(toNode("client", "id-2", ENTITY_LOOKUP.client, { name: "", notes: null }).title, "(untitled client)")
})

ok("an unknown type is a placeholder", () => {
  assert.equal(toNode("mystery", "abcdefgh-1", undefined, { title: "x" }).title, "mystery abcdefgh")
})

console.log(`\n${n} checks passed`)
