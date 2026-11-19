/** Run: npx -y tsx@4.23.15 lib/walks/walk-checks.assert.ts */
import assert from "node:assert/strict"
import { controlFor, pageFor, walkVerdicts, type PageList } from "./walk-checks"
import { parseWalk, type Walk } from "./walk-model"
import type { Checklist, Control } from "../gates/gate-model"

const control = (n: number, label: string, kind: string, workflows: Control["workflows"]): Control =>
  ({ n, label, kind, x: 0, y: 0, w: 10, h: 10, states: ["dark, 1440 wide", "light, 1440 wide"], workflows } as Control)
const tasks: Checklist = { route: "/project/p?tab=tasks", views: [{ key: "page", name: "Page", w: 100, h: 100, controls: [
  control(1, "New step", "button", [{ name: "Adds a step", kind: "function" }, { name: "Reads in both themes", kind: "look" }, { name: "Shows focus", kind: "states" }] as Control["workflows"]),
  control(2, "Group: Status", "combobox", [{ name: "Groups the board" }] as Control["workflows"]),
] }] } as Checklist
const inbox: Checklist = { route: "/inbox", views: [{ key: "page", name: "Page", w: 100, h: 100, controls: [control(1, "Answer", "button", [{ name: "Sends the answer" }] as Control["workflows"])] }] } as Checklist
const pages: PageList[] = [{ route: tasks.route, list: tasks }, { route: inbox.route, list: inbox }]

// Finding the page and the control.
assert.equal(pageFor(pages, "/project/p?tab=tasks")?.route, tasks.route)
assert.equal(pageFor(pages, "/inbox?x=1")?.route, "/inbox", "the only page with that path")
assert.equal(pageFor([...pages, { route: "/project/p?tab=checks", list: inbox }], "/project/p"), null, "two pages share the path: no guess")
assert.equal(pageFor(pages, undefined), null)
assert.equal(controlFor(tasks, { label: "  new   STEP " })?.n, 1, "labels match loosely")
assert.equal(controlFor(tasks, { label: "New step", kind: "link" }), null, "a kind given must match")

const walk = (steps: Walk["steps"], route = tasks.route): Walk => ({ goal: "Add a step", route, cold: true, outcome: "reached", steps, findings: [] })

// A good press passes only the function check, in the control's first state.
const ok = walkVerdicts(walk([{ did: "pressed New step", expected: "a form", saw: "a form", ok: true, control: { label: "New step" } }]), pages)
assert.deepEqual(ok.map((v) => [v.key, v.status]), [["1|Adds a step|dark, 1440 wide", "passed"]])
assert.match(ok[0].note, /^Pressed in the walk "Add a step", step 1: pressed New step\./)
// A workflow with no kind is a function check.
assert.equal(walkVerdicts(walk([{ did: "chose Priority", expected: "grouped", saw: "grouped", ok: true, control: { label: "Group: Status" } }]), pages)[0].key, "2|Groups the board|dark, 1440 wide")
// A wrong step fails it, and a later good press does not hide the failure.
const mixed = walkVerdicts(walk([
  { did: "pressed New step", expected: "a form", saw: "nothing", ok: false, control: { label: "New step" } },
  { did: "pressed New step again", expected: "a form", saw: "a form", ok: true, control: { label: "New step" } },
]), pages)
assert.deepEqual(mixed.map((v) => v.status), ["failed"])
// A step on another page uses its own route; steps naming no control, or an unknown one, record nothing.
assert.equal(walkVerdicts(walk([{ did: "pressed Answer", expected: "sent", saw: "sent", ok: true, route: "/inbox", control: { label: "Answer" } }]), pages)[0].route, "/inbox")
assert.deepEqual(walkVerdicts(walk([{ did: "looked", expected: "x", saw: "x", ok: true }, { did: "pressed Ghost", expected: "x", saw: "x", ok: true, control: { label: "Ghost" } }]), pages), [])
assert.deepEqual(walkVerdicts(walk([{ did: "pressed New step", expected: "x", saw: "x", ok: true, control: { label: "New step" } }], "/nowhere"), pages), [])

// Parsing keeps the route and control a step names, and drops a malformed one.
const parsed = parseWalk({ goal: "g", cold: true, outcome: "reached", steps: [
  { did: "pressed New step", expected: "a form", saw: "a form", route: "/project/p?tab=tasks", control: { label: "New step", kind: "button" } },
  { did: "looked", saw: "it", route: "not-a-route", control: { label: "" } },
], findings: [] })
assert.deepEqual(parsed.errors, [])
assert.deepEqual(parsed.walk.steps[0].control, { label: "New step", kind: "button" })
assert.equal(parsed.walk.steps[0].route, "/project/p?tab=tasks")
assert.equal(parsed.walk.steps[1].route, undefined)
assert.equal(parsed.walk.steps[1].control, undefined)

console.log("walk-checks.assert: all checks passed")
