// npx -y tsx@4.23.15 lib/project-views/project-list.assert.ts
import assert from "node:assert/strict"
import { PROJECT_STATUSES, countByStatus, listStats, showing } from "./project-list"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const P = (status: string, health = "good", progress = 0) => ({ status, health, progress })
const all = [P("in_progress", "good", 50), P("in_progress", "critical", 10), P("planning", "attention", 0), P("on_hold"), P("completed", "excellent", 100)]

ok("the count beside each status is of every project, whichever status is being shown", () => {
  // The page used to fetch only the chosen status and count from that: choosing Planning made "All" read 1 and
  // every other status read 0.
  assert.deepEqual(countByStatus(all), { all: 5, in_progress: 2, planning: 1, review: 0, on_hold: 1, completed: 1 })
})
ok("choosing a status shows only those; all shows everything", () => {
  assert.equal(showing(all, "all").length, 5)
  assert.equal(showing(all, "planning").length, 1)
  assert.equal(showing(all, "review").length, 0)
})
ok("the figures at the top are of every project and do not move with the filter", () => {
  assert.deepEqual(listStats(all), { total: 5, active: 2, atRisk: 2, avgProgress: 32 })
  assert.deepEqual(listStats([]), { total: 0, active: 0, atRisk: 0, avgProgress: 0 })
})
ok("a finished project can be asked for", () => {
  assert.ok(PROJECT_STATUSES.some(([k]) => k === "completed"))
})
console.log(`\n${n} project-list checks passed`)
