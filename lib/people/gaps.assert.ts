// npx -y tsx@4.23.15 lib/people/gaps.assert.ts
import assert from "node:assert/strict"
import { changesSinceWalk, gapSummary, peopleGaps, unreachedPages, type GapInput } from "./gaps"
import type { FlowDoc, Step } from "./people-model"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++ }
const step = (id: string, route: string | null, over: Partial<Step> = {}): Step =>
  ({ id, does: "Press it", expects: "It opens", data: "", ref: route ? { route, view: "page", kind: "Link", label: id } : null, ...over })
const person = { id: "p1", name: "Owner", background: "b", wants: "w", context: "c", frustrations: "f", may: "m", mayNot: "n", basis: "x" }
const doc = (over: Partial<FlowDoc> = {}): FlowDoc => ({
  people: [person],
  personas: [{ id: "x1", who: "p1", name: "In a hurry", habit: "h", cares: "c", at: {} }],
  flows: [{ id: "u1", who: "p1", name: "Send a note", lens: "find", steps: [step("a", "/"), step("b", "/contact"), step("c", "/contact")] }],
  areas: [],
  ...over,
})
const input = (over: Partial<GapInput> = {}): GapInput => ({ doc: doc(), pages: ["/", "/contact"], walks: [{ useCase: "u1", at: "2026-11-23T10:00:00Z", outcome: "reached" }], ships: [], requests: [], ...over })
const kinds = (i: GapInput) => peopleGaps(i).map((g) => g.kind)

t("a complete document has no gaps", () => {
  assert.deepEqual(peopleGaps(input()), [])
  assert.equal(gapSummary([]).line, "Nothing is missing.")
})

t("an empty document is one gap, not a list of noise", () => {
  assert.deepEqual(kinds(input({ doc: doc({ people: [], flows: [], personas: [] }) })), ["no-people"])
})

t("a person with blank fields, no use case and no habit", () => {
  const d = doc({ people: [{ ...person, frustrations: " ", mayNot: "" }, { ...person, id: "p2", name: "Reader" }] })
  const g = peopleGaps(input({ doc: d }))
  assert.match(g.find((x) => x.kind === "person-field")!.what, /what gets in their way, what they may not do/)
  assert.deepEqual(g.filter((x) => x.personId === "p2").map((x) => x.kind), ["person-no-use-case", "person-no-habit"])
})

t("short use cases, blank steps and steps that point at nothing", () => {
  const d = doc({ flows: [{ id: "u1", who: "p1", name: "Send", lens: "find", steps: [step("a", "/"), step("b", null, { expects: "" })] }] })
  assert.deepEqual(kinds(input({ doc: d, pages: ["/"] })), ["use-case-short", "step-blank", "step-no-control"])
})

t("steps on another way through count too", () => {
  const d = doc()
  d.flows[0].steps[1] = { ...d.flows[0].steps[1], ways: [{ id: "w", label: "Refused", ends: true, steps: [step("r", null)] }] }
  assert.match(peopleGaps(input({ doc: d })).find((g) => g.kind === "step-no-control")!.what, /1 of 4 steps/)
})

t("walks: never walked, stopped short, and changed since", () => {
  assert.deepEqual(kinds(input({ walks: [] })), ["never-walked"])
  assert.deepEqual(kinds(input({ walks: [{ useCase: "u1", at: "2026-11-23T10:00:00Z", outcome: "blocked" }] })), ["stopped-short"])
  const ships = [
    { sha: "aaaaaaa1", env: "production", routes: ["/contact"], everywhere: false, at: "2026-11-24T09:00:00Z" },
    { sha: "bbbbbbb2", env: "production", routes: ["/about"], everywhere: false, at: "2026-11-24T09:00:00Z" },
    { sha: "ccccccc3", env: "production", routes: ["/contact"], everywhere: false, at: "2026-11-22T09:00:00Z" },
    { sha: "ddddddd4", env: "report", routes: ["/contact"], everywhere: false, at: "2026-11-24T09:00:00Z" },
  ]
  const g = peopleGaps(input({ ships }))
  assert.deepEqual(g.map((x) => x.kind), ["changed-since-walk"], "a later ship to one of its pages; not another page, an older ship or a report")
  assert.match(g[0].what, /aaaaaaa/)
  const twice = [{ ...ships[0], env: "staging" }, ships[0]]
  assert.match(peopleGaps(input({ ships: twice }))[0].what, /: 1 change has shipped/, "one commit on staging and production is one change")
  const many = Array.from({ length: 5 }, (_, i) => ({ ...ships[0], sha: `f${i}000000` }))
  assert.match(peopleGaps(input({ ships: many }))[0].what, /\(f000000, f100000, f200000 and 2 more\)/, "a long list is cut to three")
  assert.equal(changesSinceWalk(doc().flows[0], "2026-11-23T10:00:00Z", [{ sha: "e", env: "staging", routes: [], everywhere: true, at: "2026-11-24T00:00:00Z" }]).length, 1, "a shared file changes every use case")
  assert.equal(peopleGaps(input({ ships, walks: [{ useCase: "u1", at: "2026-11-20T00:00:00Z", outcome: "blocked" }, { useCase: "u1", at: "2026-11-24T10:00:00Z", outcome: "reached" }] })).length, 0, "the latest walk counts, after the ships")
})

t("partial walks and other ways through (owner, 2026-11-23)", () => {
  const partial = input({ walks: [{ useCase: "u1", at: "2026-11-23T10:00:00Z", outcome: "reached", covers: ["b", "c"] }] })
  const g = peopleGaps(partial)
  assert.deepEqual(g.map((x) => x.kind), ["steps-unwalked"], "a walk of two steps leaves the first owed")
  assert.match(g[0].what, /1 of 3 steps never walked \("Press it"\)/)
  const d = doc(); d.flows[0].steps[1] = { ...d.flows[0].steps[1], ways: [{ id: "w1", label: "Refused", ends: true, steps: [step("r", "/contact")] }] }
  assert.deepEqual(kinds(input({ doc: d })), ["way-unwalked"], "a way nobody has walked is owed")
  assert.deepEqual(kinds(input({ doc: d, walks: [...input().walks, { useCase: "u1", at: "2026-11-23T11:00:00Z", outcome: "reached", way: "w1" }] })), [], "walked along it, nothing is owed")
  const ships = [{ sha: "aaaaaaa1", env: "production", routes: ["/"], everywhere: false, at: "2026-11-23T10:30:00Z" }]
  assert.deepEqual(kinds(input({ ships, walks: [{ useCase: "u1", at: "2026-11-23T10:00:00Z", outcome: "reached" }, { useCase: "u1", at: "2026-11-23T11:00:00Z", outcome: "reached", covers: ["a"] }] })), [], "a later partial walk of the changed step settles the change")
})

t("a use case re-walked in part names the steps still owed (2026-11-24)", () => {
  const d = doc(); d.flows[0].steps[2] = { ...d.flows[0].steps[2], does: "Send it" }
  const ships = [{ sha: "aaaaaaa1", env: "production", routes: [], everywhere: true, at: "2026-11-23T10:30:00Z" }]
  const walks = [{ useCase: "u1", at: "2026-11-23T10:00:00Z", outcome: "reached" }, { useCase: "u1", at: "2026-11-23T11:00:00Z", outcome: "reached", covers: ["a", "b"] }]
  const g = peopleGaps(input({ doc: d, ships, walks }))
  assert.deepEqual(g.map((x) => x.kind), ["changed-since-walk"])
  assert.equal(g[0].what, 'Send a note: 1 change has shipped to the page of the step "Send it" since its last walk (aaaaaaa); walk that step again.')
  const two = peopleGaps(input({ doc: d, ships, walks: [walks[0], { ...walks[1], covers: ["a"] }] }))[0].what
  assert.match(two, /pages of 2 steps \("Press it", "Send it"\) since their last walk \(aaaaaaa\); walk those steps again\./)
  assert.match(peopleGaps(input({ doc: d, ships, walks: [walks[0]] }))[0].what, /since it was last walked \(aaaaaaa\); walk it again and update its steps\./, "nothing re-walked: the whole use case, as before")
})

t("a step changed after its walk is owed again, in words", () => {
  const d = doc(); d.flows[0].steps[1] = { ...d.flows[0].steps[1], changedAt: "2026-11-23T12:00:00Z" }
  const g = peopleGaps(input({ doc: d }))
  assert.deepEqual(g.map((x) => x.kind), ["changed-since-walk"])
  assert.match(g[0].what, /the step "Press it" was changed after its last walk; walk that step again\./)
})

t("a use case agents proposed waits on the owner", () => {
  const d = doc(); d.flows[0] = { ...d.flows[0], proposedBy: "ai-project-planner", reviewed: false }
  const g = peopleGaps(input({ doc: d }))
  assert.deepEqual(g.map((x) => [x.kind, x.who]), [["not-reviewed", "owner"]])
  assert.equal(gapSummary(g).line, "1 waiting on the owner's review.")
})

t("pages no use case reaches and no area describes", () => {
  assert.deepEqual(unreachedPages(doc(), ["/", "/contact", "/terms", "/project/abc"]), ["/project/abc", "/terms"])
  const d = doc({ areas: [{ id: "a1", route: "/terms", name: "Terms", does: {} }] })
  d.flows[0].steps[2] = step("c", "/project/[id]")
  assert.deepEqual(unreachedPages(d, ["/", "/contact", "/terms", "/project/abc"]), [], "an area counts; a pattern covers its pages")
  assert.equal(peopleGaps(input({ pages: ["/", "/contact", "/terms"] })).filter((g) => g.kind === "page-unreached")[0].route, "/terms")
})

t("requests with no use case behind them", () => {
  const requests = [{ id: "c1", title: "Search by words", useCase: null }, { id: "c2", title: "Send faster", useCase: "send a note " }, { id: "c3", title: "Other", useCase: "Nope" }]
  assert.deepEqual(peopleGaps(input({ requests })).map((g) => g.cardId), ["c1", "c3"])
})

t("the summary counts each side", () => {
  const d = doc(); d.flows[0] = { ...d.flows[0], reviewed: false }
  assert.equal(gapSummary(peopleGaps(input({ doc: d, walks: [] }))).line, "1 for agents to fill, 1 waiting on the owner's review.")
})

console.log(`people gaps: ${n} groups of checks passed`)
