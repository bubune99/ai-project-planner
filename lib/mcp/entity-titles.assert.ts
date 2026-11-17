/* Run: npx -y tsx@4.23.15 lib/mcp/entity-titles.assert.ts */
import { groupIds, withTitles } from "./entity-titles"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}

const g = groupIds([{ type: "idea", id: "a" }, { type: "skill", id: "b" }, { type: "idea", id: "a" }, { type: "idea", id: "c" }, { type: "", id: "x" }])
eq([...g.entries()], [["idea", ["a", "c"]], ["skill", ["b"]]], "ids are grouped by type, each once, blanks dropped")

const edges = [
  { id: "e1", from: { type: "idea", id: "a" }, to: { type: "skill", id: "b" }, relation_type: "uses" },
  { id: "e2", from: { type: "idea", id: "c" }, to: { type: "mystery", id: "z" }, relation_type: "relates" },
]
const titles = new Map([["idea:a", "Guided outcomes"], ["skill:b", "Gates"], ["idea:c", "Process maps"]])
const named = withTitles(edges, titles)
eq(named[0].from, { type: "idea", id: "a", title: "Guided outcomes" }, "the from end gets its title")
eq(named[0].to, { type: "skill", id: "b", title: "Gates" }, "the to end gets its title")
eq(named[1].to, { type: "mystery", id: "z" }, "an unknown type keeps no title")
eq(named[0].relation_type, "uses", "the rest of the edge is unchanged")
eq(edges[0].from, { type: "idea", id: "a" }, "the input edges are not changed")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
