// npx -y tsx@4.23.15 lib/work/pipeline.assert.ts
import assert from "node:assert/strict"
import { faultOf, holding, jobFor, rollup, sendsOnMove, type WorkRow, startMove, whenQuestionAsked, whenQuestionAnswered, type OpenHold, PART_WAITING, partWaiting, readShipNote, shipOf } from "./pipeline"

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
  assert.equal(startMove(r({ work_kind: "owner" })).send, false)
  assert.match(startMove(r({ work_kind: "owner" })).why!, /Only you/)
  assert.equal(sendsOnMove("requested", "pending", "owner"), false)
  assert.equal(sendsOnMove("requested", "in-progress", "owner"), false)
})

// A question the owner has to answer holds its card (card f473b5d4).
const hold = (over: Partial<OpenHold> = {}): OpenHold => ({ questionId: null, waitingOn: "unknown", dependsOnCard: false, ...over })

ok("asking about a card blocks it, wherever it stood, unless it is finished or closed", () => {
  assert.equal(whenQuestionAsked({ status: "in-progress", kind: "active" }, null), "block")
  assert.equal(whenQuestionAsked({ status: "pending", kind: "open" }, null), "block")
  assert.equal(whenQuestionAsked({ status: "requested", kind: "open" }, null), "block")
  assert.equal(whenQuestionAsked({ status: "completed", kind: "done" }, null), null)
  assert.equal(whenQuestionAsked({ status: "shipped", kind: "done" }, null), null)
  assert.equal(whenQuestionAsked({ status: "closed", kind: "closed" }, null), null)
})

ok("a card already blocked keeps its own reason; only one said to wait on the owner, with no question named, takes this one", () => {
  assert.equal(whenQuestionAsked({ status: "blocked", kind: "closed" }, hold()), null)
  assert.equal(whenQuestionAsked({ status: "blocked", kind: "closed" }, hold({ waitingOn: "card", dependsOnCard: true })), null)
  assert.equal(whenQuestionAsked({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner", questionId: "q0" })), null)
  assert.equal(whenQuestionAsked({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner" })), "remember")
  assert.equal(whenQuestionAsked({ status: "blocked", kind: "closed" }, null), null)
})

ok("the answer returns the card to Up next when this question was what held it", () => {
  assert.deepEqual(whenQuestionAnswered("blocked", hold({ waitingOn: "owner", questionId: "q1" }), "q1", []), { to: "pending" })
})

ok("another open question on the same card keeps it blocked, and the card now names that one", () => {
  assert.deepEqual(whenQuestionAnswered("blocked", hold({ waitingOn: "owner", questionId: "q1" }), "q1", ["q2", "q3"]), { holdFor: "q2" })
  // Answering the second while the first still holds the card changes nothing.
  assert.equal(whenQuestionAnswered("blocked", hold({ waitingOn: "owner", questionId: "q1" }), "q2", ["q1"]), null)
})

ok("a card finished, moved by the owner, or blocked again for another reason is left where it is", () => {
  assert.equal(whenQuestionAnswered("completed", null, "q1", []), null)
  assert.equal(whenQuestionAnswered("in-progress", null, "q1", []), null)
  assert.equal(whenQuestionAnswered("pending", null, "q1", []), null)
  assert.equal(whenQuestionAnswered("blocked", hold(), "q1", []), null)
  assert.equal(whenQuestionAnswered("blocked", hold({ waitingOn: "card", dependsOnCard: true }), "q1", []), null)
  assert.equal(whenQuestionAnswered("blocked", null, "q1", []), null)
})

// Shipped, part waiting on the owner (card 2f95e84a). The notes are the exact words `gates shipped` writes on a card.
const LIVE_CLOSE = "Done and live: bubune99/crypto-collab@0f9af3f9 on main. Seen: the A7 panel on crypto.example.com shows the new model picker"
const LIVE_ADVANCE = "Moved on: bubune99/crypto-collab@0f9af3f9 on main. Seen: the A7 panel shows the model picker. Still to do: the paid model run, which waits on the owner"
const STAGING_CLOSE = "On staging, not yet in production (bubune99/crypto-collab@0f9af3f9 on staging). Seen: the panel on staging. The card closes when this reaches production."
const STAGING_ADVANCE = "Moved on (staging only): bubune99/crypto-collab@0f9af3f9 on staging. Seen: the panel on staging. Still to do: production"
const note = (body: string, at = "2026-11-17T20:00:00Z", authorLabel = "gates shipped") => ({ authorLabel, body, at })
const RECORDED = [{ sha: "0f9af3f9c2d1e0aa11223344556677889900aabb", at: "2026-11-17T19:58:00Z" }]

ok("a ship note is read only from what `gates shipped` wrote, and only production counts as live", () => {
  assert.deepEqual(readShipNote("gates shipped", LIVE_CLOSE), { sha: "0f9af3f9", repo: "bubune99/crypto-collab", target: "main", left: null })
  assert.deepEqual(readShipNote("gates shipped", LIVE_ADVANCE), { sha: "0f9af3f9", repo: "bubune99/crypto-collab", target: "main", left: "the paid model run, which waits on the owner" })
  assert.equal(readShipNote("gates shipped", STAGING_CLOSE), null, "staging is never shipped")
  assert.equal(readShipNote("gates shipped", STAGING_ADVANCE), null)
  assert.equal(readShipNote("claude-code", LIVE_CLOSE), null, "the same words from anyone else are a comment, not a ship")
  assert.equal(readShipNote(null, LIVE_CLOSE), null)
  assert.equal(readShipNote("gates shipped", "It shipped, trust me"), null)
  assert.equal(readShipNote("gates shipped", "Done and live: repo@nothex on main. Seen: x"), null)
})

ok("a card has shipped only when its note's commit has a production ship record; the newest one is shown", () => {
  assert.deepEqual(shipOf([note(LIVE_ADVANCE)], RECORDED), { sha: "0f9af3f9", repo: "bubune99/crypto-collab", target: "main", at: "2026-11-17T19:58:00Z", left: "the paid model run, which waits on the owner" })
  assert.equal(shipOf([note(LIVE_ADVANCE)], []), null, "a note with no ship record behind it is not a ship")
  assert.equal(shipOf([note(LIVE_ADVANCE)], [{ sha: "aaaaaaa1", at: "2026-11-17T19:58:00Z" }]), null, "another commit's record does not count")
  assert.equal(shipOf([note(STAGING_CLOSE)], RECORDED), null)
  assert.equal(shipOf([], RECORDED), null)
  assert.equal(shipOf([note("Just a comment", undefined, "owner")], RECORDED), null)
  const two = shipOf([note(LIVE_ADVANCE, "2026-11-17T20:00:00Z"), note("Done and live: bubune99/crypto-collab@1234abcd on main. Seen: the run finished on the live page", "2026-11-19T09:00:00Z")], [...RECORDED, { sha: "1234abcd", at: "2026-11-19T08:55:00Z" }])
  assert.equal(two?.sha, "1234abcd"); assert.equal(two?.left, null)
  assert.equal(shipOf([note(LIVE_CLOSE)], [{ sha: "0f9af3f", at: "2026-11-17T19:58:00Z" }])?.sha, "0f9af3f9", "a record kept with a 7-character commit still matches")
})

const SHIP = shipOf([note(LIVE_ADVANCE)], RECORDED)
const Q1 = { id: "q1", text: "Run the paid model on A7? It costs about $4." }, Q2 = { id: "q2", text: "Keep the old picker too?" }

ok("no ship and an open question: plain Blocked", () => {
  assert.equal(partWaiting({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner", questionId: "q1" }), [Q1], null), null)
})

ok("a ship and an open question that holds the card: shipped, part waiting on you, naming the question", () => {
  const w = partWaiting({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner", questionId: "q1" }), [Q2, Q1], SHIP)
  assert.equal(PART_WAITING, "Shipped, part waiting on you")
  assert.deepEqual(w, { label: PART_WAITING, questionId: "q1", question: Q1.text, ship: SHIP })
})

ok("a finished card with a ship and an open question about it is not shown as simply complete", () => {
  assert.deepEqual(partWaiting({ status: "completed", kind: "done" }, null, [Q2, Q1], SHIP), { label: PART_WAITING, questionId: "q2", question: Q2.text, ship: SHIP })
  assert.equal(partWaiting({ status: "completed", kind: "done" }, null, [], SHIP), null, "finished with nothing owed is complete")
  assert.equal(partWaiting({ status: "completed", kind: "done" }, null, [Q1], null), null, "no recorded ship: the existing rule")
})

ok("when the question is answered, or the card waits on something else, it follows the existing rule", () => {
  assert.equal(partWaiting({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner", questionId: "q1" }), [], SHIP), null, "answered: no longer open")
  assert.equal(partWaiting({ status: "pending", kind: "open" }, null, [], SHIP), null, "back in Up next after the answer")
  assert.equal(partWaiting({ status: "blocked", kind: "closed" }, hold({ waitingOn: "card", dependsOnCard: true }), [Q1], SHIP), null, "blocked on another card")
  assert.equal(partWaiting({ status: "blocked", kind: "closed" }, hold({ waitingOn: "owner" }), [Q1], SHIP), null, "blocked on the owner with no question named")
  assert.equal(partWaiting({ status: "blocked", kind: "closed" }, null, [Q1], SHIP), null)
  assert.equal(partWaiting({ status: "in-progress", kind: "active" }, null, [Q1], SHIP), null, "an agent is on it: it is in progress")
  assert.equal(partWaiting({ status: "closed", kind: "closed" }, null, [Q1], SHIP), null, "closed will not be done")
})

console.log(`\n${n} pipeline checks passed`)
