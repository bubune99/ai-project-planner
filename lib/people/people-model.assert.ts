import assert from "node:assert/strict"
import type { Checklist, Result } from "../gates/gate-model"
import { areaMeaning, cellKind, controlState, describeChanges, emptyDoc, findControl, freshId, orphans, parseDoc, scoreFlow, shiftSpan, shiftSpans, stepState, type FlowDoc, type PageRecord } from "./people-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

const wf = [{ name: "Use", steps: [{ do: "Click it", expect: "It works", there: [], gone: [] }] }]
const list: Checklist = {
  route: "/app",
  views: [
    { key: "page", name: "Page", w: 1000, h: 800, controls: [
      { n: 1, label: "Add a transaction", kind: "Button", x: 10, y: 10, w: 80, h: 30, states: ["Signed in", "Phone"], workflows: wf },
      { n: 2, label: "Left this month", kind: "Text", x: 10, y: 60, w: 200, h: 30, states: ["Signed in"], workflows: wf },
      { n: 3, label: "Search", kind: "Button", x: 300, y: 10, w: 80, h: 30, states: ["Signed in"], workflows: wf },
    ] },
    { key: "menu", name: "Opened by Search", w: 400, h: 300, controls: [
      { n: 4, label: "Go to Budgets", kind: "Link", x: 10, y: 10, w: 200, h: 30, states: ["Signed in"], workflows: wf },
    ] },
  ],
}
const R = (key: string, actor: Result["actor"], status: Result["status"], at: string): Result => ({ key, actor, status, at })
const page = (results: Result[]): Record<string, PageRecord> => ({ "/app": { list, results } })
const ref = (label: string, kind = "Button", view = "page") => ({ route: "/app", view, kind, label })

const doc: FlowDoc = {
  people: [{ id: "holder", name: "Account holder", background: "Runs a household", wants: "Know where the money stands", context: "Phone, mornings", frustrations: "Adding things up", may: "Everything", mayNot: "Nothing", basis: "From the page" }],
  personas: [{ id: "daily", who: "holder", name: "The daily checker", habit: "Half a minute", cares: "One number", at: { stand: [1, 1] } }, { id: "monthly", who: "holder", name: "The monthly planner", habit: "Once a month", cares: "Budgets", at: {} }],
  flows: [{ id: "stand", who: "holder", name: "See where I stand", lens: "Short on time", steps: [
    { id: "s1", does: "Opens search", expects: "A box", data: "An action", ref: ref("Search") },
    { id: "s2", does: "Reads what is left", expects: "One figure", data: "Worked out", ref: ref("Left this month", "Text") },
    { id: "s3", does: "Approves a change", expects: "It waits for a yes", data: "An action", ref: null },
  ] }],
  areas: [{ id: "a1", route: "/app", name: "Left this month", ref: ref("Left this month", "Text"), does: { daily: "Starts and stops here", monthly: "Reads it" } }],
}

ok("a sound document is read back unchanged", () => {
  const { doc: out, errors } = parseDoc(JSON.parse(JSON.stringify(doc)))
  assert.deepEqual(errors, [])
  assert.deepEqual(out, doc)
  assert.deepEqual(parseDoc(undefined), { doc: emptyDoc(), errors: [] })
})

ok("what is wrong with a document is said in words", () => {
  const bad = JSON.parse(JSON.stringify(doc))
  bad.flows[0].who = "nobody"; bad.people.push({ ...bad.people[0] }); bad.flows[0].steps[0].does = "  "; bad.personas[0].at.stand = [2, 1]
  const { errors } = parseDoc(bad)
  assert.ok(errors.some((e) => e.includes("a person who is not in the list")))
  assert.ok(errors.some((e) => e.includes('"holder" is used twice')))
  assert.ok(errors.some((e) => e.includes('step 1 "does" is empty')))
  assert.ok(errors.some((e) => e.includes("two step numbers in order")))
})

ok("unknown fields are dropped, text is trimmed, and a span is kept inside the steps that exist", () => {
  const raw = JSON.parse(JSON.stringify(doc))
  raw.people[0].evil = "<script>"; raw.people[0].name = "  Account   holder "; raw.personas[0].at = { stand: [1, 9], gone: [0, 0] }; raw.areas[0].does.nobody = "x"
  const { doc: out, errors } = parseDoc(raw)
  assert.deepEqual(errors, [])
  assert.equal("evil" in out.people[0], false)
  assert.equal(out.people[0].name, "Account holder")
  assert.deepEqual(out.personas[0].at, { stand: [1, 2] })
  assert.deepEqual(Object.keys(out.areas[0].does), ["daily", "monthly"])
})

ok("a link finds its control after a rescan renumbers the page or moves it to another view", () => {
  assert.equal(findControl(list, ref("Search"))!.control.n, 3)
  assert.equal(findControl(list, ref("Go to Budgets", "Link", "page"))!.view.key, "menu")
  assert.equal(findControl(list, ref("Deleted thing")), null)
  assert.equal(findControl(null, ref("Search")), null)
})

ok("a control is verified only when every one of its checks has cleared", () => {
  assert.equal(controlState({ list, results: [] }, 1), "pending")
  assert.equal(controlState({ list, results: [R("1|Use|Signed in", "builder", "passed", "t1")] }, 1), "pending")
  assert.equal(controlState({ list, results: [R("1|Use|Signed in", "builder", "passed", "t1"), R("1|Use|Phone", "builder", "passed", "t2")] }, 1), "passed")
  assert.equal(controlState({ list, results: [R("1|Use|Signed in", "builder", "passed", "t1"), R("1|Use|Phone", "scan", "failed", "t2")] }, 1), "flagged")
  assert.equal(controlState({ list, results: [R("1|Use|Phone", "scan", "failed", "t2"), R("1|Use|Phone", "reviewer", "failed", "t3")] }, 1), "failed")
})

ok("a step's state is read from the record, and a step with nothing behind it says so", () => {
  const pages = page([R("3|Use|Signed in", "builder", "passed", "t1")])
  assert.equal(stepState(pages, doc.flows[0].steps[0]), "passed")
  assert.equal(stepState(pages, doc.flows[0].steps[1]), "pending")
  assert.equal(stepState(pages, doc.flows[0].steps[2]), "unbuilt")
  assert.equal(stepState(pages, { ...doc.flows[0].steps[0], ref: ref("Gone") }), "missing")
  assert.equal(stepState({}, doc.flows[0].steps[0]), "missing")
  assert.deepEqual(scoreFlow(pages, doc.flows[0]), { n: 3, ok: 1, bad: 0, open: 1, gap: 1 })
})

ok("controls no use case reaches are listed; words, cards and charts are not controls", () => {
  assert.deepEqual(orphans("/app", list, doc).map((o) => o.control.label), ["Add a transaction", "Go to Budgets"])
  assert.deepEqual(orphans("/app", list, emptyDoc()).map((o) => o.control.n), [1, 3, 4])
})

ok("the page comparison says what each row means for the design", () => {
  const cells = (a: string, b: string) => [{ persona: "The daily checker", text: a }, { persona: "The monthly planner", text: b }]
  assert.equal(areaMeaning(cells("Starts and stops here", "Reads it")), "The daily checker begins here: it must be seen without scrolling.")
  assert.equal(areaMeaning(cells("Starts here", "Starts here")), "The daily checker and The monthly planner begin here: it must be seen without scrolling.")
  assert.equal(areaMeaning(cells("Skips", "Not used")), "Nobody uses it. Why is it here?")
  assert.equal(areaMeaning(cells("Skips", "Checks for mistakes")), "One kind of user only. It can sit lower.")
  assert.equal(areaMeaning(cells("Glances", "Reads all four")), "Shared by several. Keep it steady.")
  assert.deepEqual([cellKind("Starts here"), cellKind("Skips"), cellKind(""), cellKind("Glances")], ["start", "off", "off", ""])
})

ok("every change is described for the record, and no change means no entry", () => {
  const next: FlowDoc = JSON.parse(JSON.stringify(doc))
  assert.deepEqual(describeChanges(doc, next), [])
  next.people[0].wants = "Never miss a bill"
  next.people.push({ ...doc.people[0], id: "second", name: "A second person" })
  next.flows[0].name = "See where I stand this month"
  next.flows[0].steps = [next.flows[0].steps[1], next.flows[0].steps[0], { id: "s4", does: "Opens the full list", expects: "", data: "", ref: null }]
  next.flows[0].steps[0].ref = null
  next.personas.pop()
  const lines = describeChanges(doc, next)
  assert.ok(lines.includes('Added person "A second person"'))
  assert.ok(lines.includes('Changed what they want of person "Account holder"'))
  assert.ok(lines.includes('Renamed use case "See where I stand" to "See where I stand this month"'))
  assert.ok(lines.includes('Use case "See where I stand this month": added the step "Opens the full list"'))
  assert.ok(lines.includes('Use case "See where I stand this month": removed the step "Approves a change"'))
  assert.ok(lines.includes('Use case "See where I stand this month": the step "Reads what is left" no longer points at anything on the page'))
  assert.ok(lines.includes('Use case "See where I stand this month": the steps were put in a different order'))
  assert.ok(lines.includes('Removed persona "The monthly planner"'))
})

ok("taking out or adding a step keeps each persona on the same steps", () => {
  assert.deepEqual(shiftSpan([2, 3], 0, "removed"), [1, 2])     // a step before it went: both ends move up
  assert.deepEqual(shiftSpan([2, 3], 3, "removed"), [2, 2])     // its last step went: it ends one sooner
  assert.deepEqual(shiftSpan([2, 3], 4, "removed"), [2, 3])     // a step after it went: nothing changes
  assert.equal(shiftSpan([1, 1], 1, "removed"), null)           // its only step went: nothing left to point at
  assert.deepEqual(shiftSpan([1, 1], 0, "removed"), [0, 0])
  assert.deepEqual(shiftSpan([1, 2], 1, "inserted"), [2, 3])    // a step put in before it: both ends move down
  assert.deepEqual(shiftSpan([1, 2], 2, "inserted"), [1, 3])    // put in the middle: it now covers the new step too
  assert.deepEqual(shiftSpan([1, 2], 3, "inserted"), [1, 2])    // put in after it: nothing changes
  const personas = JSON.parse(JSON.stringify(doc.personas))
  shiftSpans(personas, "stand", 1, "removed")
  assert.deepEqual(personas[0].at, {})                          // the daily checker's only step was removed
  shiftSpans(personas, "other", 0, "removed")                   // another use case: untouched
})

ok("a new id never collides with one in use", () => {
  assert.equal(freshId("p", ["p1", "p2"], 1), "p3")
  assert.equal(freshId("s", [], 10), "sa")
})

console.log(`\n${n} checks passed`)
