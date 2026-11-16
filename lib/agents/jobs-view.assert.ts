// npx -y tsx@4.23.15 lib/agents/jobs-view.assert.ts
import assert from "node:assert/strict"
import { JOB_STATUSES, canCancelJob, canDeleteJob, createdInLastDay, filterJobs, jobStatusLabel, showsProgress, whenLabel } from "./jobs-view"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const now = new Date("2026-11-15T18:00:00Z")

t("every status has a word; an unknown one is made readable, never printed raw", () => {
  assert.equal(jobStatusLabel("awaiting-unlock"), "Waiting on you")
  assert.equal(jobStatusLabel("in_progress"), "In progress")
  assert.equal(jobStatusLabel("some_new-state"), "Some new state")
  assert.equal(jobStatusLabel(""), "Unknown")
  for (const s of JOB_STATUSES) assert.ok(!/[_-]/.test(jobStatusLabel(s)), s)
})

t("jobs in the last day are counted by when they were made, not by how many are listed", () => {
  const jobs = [
    { status: "completed", createdAt: "2026-11-15T12:00:00Z" },
    { status: "pending", createdAt: "2026-11-14T18:00:01Z" },
    { status: "pending", createdAt: "2026-11-14T18:00:00Z" },
    { status: "pending", createdAt: "2026-10-01T00:00:00Z" },
    { status: "pending", createdAt: "not a date" },
  ]
  assert.equal(createdInLastDay(jobs, now), 2)
  assert.equal(createdInLastDay([], now), 0)
})

t("progress shows only while a job is being worked", () => {
  assert.ok(showsProgress("in_progress")); assert.ok(showsProgress("assigned"))
  assert.ok(!showsProgress("completed")); assert.ok(!showsProgress("pending")); assert.ok(!showsProgress("awaiting-unlock"))
})

t("what can be cancelled or removed", () => {
  assert.ok(canCancelJob("pending")); assert.ok(canCancelJob("in_progress"))
  assert.ok(!canCancelJob("awaiting-unlock")); assert.ok(!canCancelJob("completed")); assert.ok(!canCancelJob("cancelled"))
  assert.ok(canDeleteJob("pending")); assert.ok(canDeleteJob("cancelled"))
  assert.ok(!canDeleteJob("in_progress")); assert.ok(!canDeleteJob("completed"))
})

t("filters combine and leave a column alone on 'all'", () => {
  const jobs = [
    { status: "pending", agent: { name: "claude" } },
    { status: "pending", agent: null },
    { status: "completed", agent: { name: "claude" } },
  ]
  assert.equal(filterJobs(jobs, "all", "all").length, 3)
  assert.equal(filterJobs(jobs, "pending", "all").length, 2)
  assert.equal(filterJobs(jobs, "pending", "claude").length, 1)
  assert.equal(filterJobs(jobs, "all", "unassigned").length, 1)
  assert.equal(filterJobs(jobs, "failed", "all").length, 0)
})

t("a date from another year carries its year", () => {
  assert.equal(whenLabel(null, now), "Never")
  assert.equal(whenLabel("2026-11-15T17:59:40Z", now), "Just now")
  assert.equal(whenLabel("2026-11-15T17:30:00Z", now), "30m ago")
  assert.equal(whenLabel("2026-11-15T06:00:00Z", now), "12h ago")
  assert.equal(whenLabel("2026-11-14T12:00:00Z", now), "Yesterday")
  assert.equal(whenLabel("2026-11-12T12:00:00Z", now), "3d ago")
  assert.match(whenLabel("2026-10-01T12:00:00Z", now), /^Oct 1$/)
  assert.match(whenLabel("2025-11-21T12:00:00Z", now), /^Nov 21, 2025$/)
  assert.equal(whenLabel("garbage", now), "Unknown")
})

console.log(`\n${n} jobs-view checks passed`)
