import assert from "node:assert/strict"
import { phaseStrip } from "./phase-strip"

let n = 0
const ok = (f: () => void) => { f(); n++ }

// The planner's own cards, as they are in production on 2026-11-16.
const planner = [
  { title: "Phase 1 — Foundation", phase: "1", status: "completed", stage: "completed" },
  { title: "Phase 2 — View Fixes & MCP Reconnection", phase: "2", status: "completed", stage: "completed" },
  { title: "Phase 3 — Dashboard Completion", phase: "3", status: "requested", stage: "in-progress" },
  { title: "Phase 4 — CLI Tooling & Observability", phase: "4", status: "requested", stage: "not-started" },
  { title: "Phase 5 — Marketing & Portfolio Growth", phase: "5", status: "requested", stage: "not-started" },
  ...Array.from({ length: 192 }, (_, i) => ({ title: "card " + i, phase: "ideation", status: i % 2 ? "completed" : "requested" })),
]
const p = phaseStrip(planner)
ok(() => assert.deepEqual(p.phases.map((x) => x.name), ["Foundation", "View Fixes & MCP Reconnection", "Dashboard Completion", "CLI Tooling & Observability", "Marketing & Portfolio Growth"]))
ok(() => assert.equal(p.outside, 192))
ok(() => assert.deepEqual(p.phases.map((x) => x.status), ["done", "done", "active", "upcoming", "upcoming"]))
ok(() => assert.deepEqual(p.phases.map((x) => x.number), [1, 2, 3, 4, 5]))

// Order is by number, not by which card came first; "10" sorts after "9".
ok(() => assert.deepEqual(phaseStrip([{ phase: "10" }, { phase: "2" }, { phase: "9" }]).phases.map((x) => x.number), [2, 9, 10]))
// No heading card: the name says which phase it is, never a bare digit.
ok(() => assert.equal(phaseStrip([{ title: "Write the API", phase: "2" }]).phases[0].name, "Phase 2"))
// A heading for a different number does not name this phase.
ok(() => assert.equal(phaseStrip([{ title: "Phase 3 — Wrong", phase: "2" }]).phases[0].name, "Phase 2"))
// Headings written with a colon or a plain dash are read too.
ok(() => assert.equal(phaseStrip([{ title: "Phase 4: Launch", phase: "4" }]).phases[0].name, "Launch"))
ok(() => assert.equal(phaseStrip([{ title: "phase 4 - Launch", phase: "4" }]).phases[0].name, "Launch"))
// Counts within a phase.
ok(() => { const x = phaseStrip([{ phase: "1", status: "completed" }, { phase: "1", status: "pending" }]).phases[0]; assert.equal(x.done, 1); assert.equal(x.total, 2); assert.equal(x.status, "active") })
// A card being worked makes its phase active even with nothing done.
ok(() => assert.equal(phaseStrip([{ phase: "1", status: "in-progress" }]).phases[0].status, "active"))
// Empty, null and missing input.
ok(() => assert.deepEqual(phaseStrip([]), { phases: [], outside: 0 }))
ok(() => assert.deepEqual(phaseStrip(null as any), { phases: [], outside: 0 }))
ok(() => assert.equal(phaseStrip([{ phase: null }, { phase: "" }]).outside, 2))

console.log(`${n} passed, 0 failed`)
