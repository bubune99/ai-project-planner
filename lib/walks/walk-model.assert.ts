import assert from "node:assert/strict"
import { HANDLED_BY, coverage, openFindings, parseWalk, walkLine, type StoredWalk, type Walk } from "./walk-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const step = (did: string, saw: string, okay = true) => ({ did, expected: "It works", saw, ok: okay })
const good: Walk = { goal: "Record a purchase", useCase: "record", persona: "daily", route: "/app", cold: true, outcome: "reached", steps: [step("Pressed Add a transaction", "A form opened"), step("Typed 12.50 and saved", "It appeared in the list")], findings: [], env: "staging", build: "abc" }

ok("a sound walk is read back unchanged", () => {
  const { walk, errors } = parseWalk(JSON.parse(JSON.stringify(good)))
  assert.deepEqual(errors, []); assert.deepEqual(walk, good)
})

ok("a walk has to say what happened: a goal, steps, and how it ended", () => {
  const e = parseWalk({}).errors
  assert.ok(e.some((x) => x.includes("needs a goal"))); assert.ok(e.some((x) => x.includes("no steps"))); assert.ok(e.some((x) => x.includes("how it ended")))
  assert.ok(parseWalk({ ...good, steps: [{ did: "Clicked", saw: "" }] }).errors.some((x) => x.includes("what was done and what was seen")))
})

ok("stopping short is only accepted with the reason, written as a finding someone will act on", () => {
  const stopped = { ...good, outcome: "blocked", steps: [step("Looked for a way to add a budget", "No button for it anywhere", false)] }
  assert.ok(parseWalk(stopped).errors.some((x) => x.includes("says why it stopped")))
  assert.ok(parseWalk({ ...stopped, why: "Nothing adds a budget" }).errors.some((x) => x.includes("records what stopped it as a finding")))
  assert.ok(parseWalk({ ...stopped, why: "Nothing adds a budget", findings: [{ kind: "taste", what: "The blue is dull" }] }).errors.length > 0)   // taste does not stop anyone
  assert.deepEqual(parseWalk({ ...stopped, why: "Nothing adds a budget", findings: [{ kind: "gap", what: "No way to add a budget from the dashboard", step: 0 }] }).errors, [])
})

ok("a goal is not reached if the last step went wrong", () => {
  assert.ok(parseWalk({ ...good, steps: [step("Saved", "An error appeared", false)] }).errors.some((x) => x.includes("goal was not reached")))
})

ok("a finding needs a kind and words, and unknown fields are dropped", () => {
  const { walk, errors } = parseWalk({ ...good, findings: [{ kind: "bug", what: "x" }, { kind: "gap", what: "  " }, { kind: "friction", what: "Five clicks to reach it", step: 99, evil: 1, suggest: "Put it on the dashboard" }] })
  assert.ok(errors.some((x) => x.includes("Finding 1 needs a kind"))); assert.ok(errors.some((x) => x.includes("Finding 2 does not say")))
  assert.deepEqual(walk.findings[2], { kind: "friction", what: "Five clicks to reach it", suggest: "Put it on the dashboard" })      // a step that does not exist is not kept
})

ok("errors are never the owner's; taste always is; a gap goes to the plan", () => {
  assert.equal(HANDLED_BY.error.who, "agents"); assert.equal(HANDLED_BY.gap.who, "agents")
  assert.equal(HANDLED_BY.taste.who, "owner"); assert.equal(HANDLED_BY.friction.who, "owner")
})

ok("a walk reads as one line", () => {
  assert.equal(walkLine(good), "Reached the goal in 2 steps: nothing found.")
  const hard: Walk = { ...good, steps: [...good.steps.slice(0, 1), step("Looked for Save", "It was below the fold", false), good.steps[1]], findings: [{ kind: "friction", what: "Save is out of sight" }, { kind: "gap", what: "No undo" }, { kind: "gap", what: "No receipt" }] }
  assert.equal(walkLine(hard), "Reached the goal in 3 steps, 1 not as expected: 2 gaps, 1 hard.")
  assert.equal(walkLine({ ...good, outcome: "gave_up", why: "x", steps: good.steps.slice(0, 1), findings: [{ kind: "error", what: "The form never opens" }] }), "Gave up after 1 step: 1 error.")
})

const S = (id: string, at: string, w: Partial<Walk>): StoredWalk => ({ ...good, ...w, id, at, actor: "agent" })
ok("coverage says which use cases were never walked, or only on an older build", () => {
  const walks = [S("w1", "2026-11-14T10:00:00Z", {}), S("w2", "2026-11-14T12:00:00Z", { outcome: "blocked", why: "x" }), S("w3", "2026-11-13T09:00:00Z", { useCase: "bills", build: "old" })]
  const c = coverage([{ id: "record", name: "Record a purchase" }, { id: "bills", name: "Check bills" }, { id: "find", name: "Find a screen" }], walks, "abc")
  assert.deepEqual(c.map((x) => [x.useCase, x.walks, x.state, x.last?.id ?? null]), [["record", 2, "stopped", "w2"], ["bills", 1, "stale", "w3"], ["find", 0, "never", null]])
  assert.equal(coverage([{ id: "bills", name: "Check bills" }], walks)[0].state, "reached")       // no build in question: the walk stands
})

ok("the same finding met on two walks is listed once, from the newest", () => {
  const walks = [S("w1", "2026-11-14T10:00:00Z", { findings: [{ kind: "gap", what: "No undo" }] }), S("w2", "2026-11-14T12:00:00Z", { findings: [{ kind: "gap", what: "no undo" }, { kind: "error", what: "Save fails" }] })]
  const open = openFindings(walks)
  assert.deepEqual(open.map((f) => [f.what, f.walk, f.who]), [["no undo", "w2", "agents"], ["Save fails", "w2", "agents"]])
})

console.log(`\n${n} checks passed`)
