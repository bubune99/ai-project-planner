// npx -y tsx@4.23.15 lib/work/pipeline.assert.ts
import assert from "node:assert/strict"
import { faultOf, holding, jobFor, rollup, sendsOnMove, type WorkRow, startMove } from "./pipeline"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const R = (id: string, over: Partial<WorkRow> = {}): WorkRow => ({ id, title: id, status: "pending", ...over })
const now = new Date("2026-11-16T12:00:00Z")
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

ok("moving a card into Up next or In progress sends it to an agent; moving within them does not", () => {
  assert.equal(sendsOnMove("requested", "pending", "task"), true)
  assert.equal(sendsOnMove("requested", "in-progress", "upkeep"), true)
  assert.equal(sendsOnMove("blocked", "pending", "task"), true)
  assert.equal(sendsOnMove(null, "pending", "task"), true, "a card made straight in Up next is sent")
  assert.equal(sendsOnMove("pending", "in-progress", "task"), false, "already sent")
  assert.equal(sendsOnMove("in-progress", "completed", "task"), false)
  assert.equal(sendsOnMove("requested", "pending", "initiative"), false, "an initiative's tasks are sent, not the initiative")
})

ok("in progress shows who holds it; a card sent and not picked up within 30 minutes is a fault", () => {
  assert.deepEqual(holding(R("a", { status: "in-progress", claimed_by_id: "claude-code", claimed_at: minsAgo(5) }), now), { state: "held", by: "claude-code", since: minsAgo(5) })
  assert.equal(holding(R("b", { status: "in-progress", metadata: { work: { sentAt: minsAgo(10) } } }), now)?.state, "sent")
  assert.equal(faultOf(R("b", { status: "in-progress", metadata: { work: { sentAt: minsAgo(10) } } }), now), null)
  assert.equal(faultOf(R("c", { status: "in-progress", metadata: { work: { sentAt: minsAgo(45) } } }), now), "In progress, but no agent holds it.")
  assert.equal(faultOf(R("d", { status: "in-progress" }), now), "In progress, but no agent holds it.")
  assert.equal(faultOf(R("e", { status: "in-progress", claimed_by_id: "x", work_kind: "initiative" }), now), "An initiative is never in progress itself; its tasks are.")
  assert.equal(holding(R("f"), now), null)
})

ok("the job names the project and the card, and says how to finish", () => {
  const j = jobFor(R("t1", { title: "Fix the inbox count", priority: "urgent", description: "It lags" }), "p1", false)
  assert.equal(j.title, "Work: Fix the inbox count")
  assert.deepEqual(j.input, { projectId: "p1", kind: "work", stepId: "t1" })
  assert.equal(j.priority, "critical"); assert.equal(j.parentStepId, "t1")
  assert.match(j.description, /Claim it .* finish with proof, or put it back with a note/)
  assert.equal(jobFor(R("t2"), "p1", true).priority, "high")
  const named = jobFor(R("t3", { title: "Fix the count" }), "p1", false, "AI Project Planner")
  assert.equal(named.title, "Work (AI Project Planner): Fix the count")
  assert.match(named.description, /^Project: AI Project Planner\. /)
  assert.equal(named.input.projectName, "AI Project Planner")
})

ok("an initiative counts the steps of tasks that are broken down, and the task itself when not", () => {
  const rows = [
    R("camp", { work_kind: "initiative", metadata: { work: { type: "campaign", ends: "2026-12-01" } } }),
    R("t1", { parent_task_id: "camp" }),
    R("s1", { parent_task_id: "t1", status: "completed" }), R("s2", { parent_task_id: "t1", status: "completed" }), R("s3", { parent_task_id: "t1" }),
    R("t2", { parent_task_id: "camp", status: "completed" }),
    R("t3", { parent_task_id: "camp", status: "in-progress", claimed_by_id: "claude-code" }),
    R("idea", { parent_task_id: "camp", status: "requested" }),
  ]
  assert.deepEqual(rollup(rows[0], rows), { tasks: 3, done: 1, working: 1, steps: 5, stepsDone: 3, type: "campaign", ends: "2026-12-01" })
})

ok("Start puts a card in Up next and sends it; never makes an unheld In Progress card", () => {
  const r = (o: any) => ({ id: "s", title: "t", status: "requested", ...o })
  assert.deepEqual(startMove(r({})), { to: "pending", send: true })
  assert.deepEqual(startMove(r({ status: "pending" })), { to: null, send: true })
  assert.deepEqual(startMove(r({ status: "blocked" })), { to: "pending", send: true })
  assert.equal(startMove(r({ status: "in-progress", claimed_by_id: "agent1" })).send, false)
  assert.match(startMove(r({ status: "in-progress", claimed_by_id: "agent1" })).why!, /agent1/)
  assert.equal(startMove(r({ status: "completed" })).send, false)
  assert.equal(startMove(r({ work_kind: "initiative" })).send, false)
  for (const s of ["requested", "pending", "blocked", "paused"]) assert.notEqual(startMove(r({ status: s })).to, "in-progress")
})

console.log(`\n${n} pipeline checks passed`)
