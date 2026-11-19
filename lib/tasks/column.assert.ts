/** Run: npx -y tsx@4.23.15 lib/tasks/column.assert.ts */
import assert from "node:assert/strict"
import { startingColumn } from "./column"

// A status given outright wins.
assert.equal(startingColumn({ status: "in-progress", kind: "idea", title: "x" }), "in-progress")
// By kind.
assert.equal(startingColumn({ kind: "fix", title: "Totals" }), "pending")
assert.equal(startingColumn({ kind: "asked_now", title: "Add a phone layout" }), "pending")
assert.equal(startingColumn({ kind: "idea", title: "Fix: maybe later" }), "requested", "the kind beats the title")
// No kind: a title naming a fault is a fix; anything else waits in Requests.
for (const t of ["Fix: the dashboard counts an unpaid order", "Bug in export", "Broken link on Settings", "The search box does not work", "Save never saves on a phone"]) assert.equal(startingColumn({ title: t }), "pending", t)
for (const t of ["Design system lives in the planner", "Hypothesis to test: models under the system", "Prefix checks by kind", "Fixed-width layout idea"]) assert.equal(startingColumn({ title: t }), "requested", t)

console.log("column.assert: all checks passed")
