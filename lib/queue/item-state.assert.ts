// npx -y tsx@4.23.15 lib/queue/item-state.assert.ts
import assert from "node:assert/strict"
import { QueueError, claimPatch, donePatch, itemState, mayClaim, mayUndo, planChangeNote, undoPatch, routing, wakeFor, whereItWent, type ItemRow } from "./item-state"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name) }
const NOW = new Date("2026-11-15T01:00:00Z").getTime()
const row = (over: Partial<ItemRow> = {}): ItemRow => ({ status: "completed", askedBy: "claude-code@planner", projectId: "p1", answeredAt: "2026-11-15T00:50:00Z", metadata: null, ...over })

t("the five states are told apart", () => {
  assert.equal(itemState(row({ status: "awaiting-unlock", answeredAt: null })), "waiting")
  assert.equal(itemState(row()), "unclaimed")
  assert.equal(itemState(row({ metadata: { claimedBy: "a", claimedAt: "2026-11-15T00:55:00Z" } })), "claimed")
  assert.equal(itemState(row({ metadata: { claimedBy: "a", doneAt: "2026-11-15T00:58:00Z", doneNote: "x" } })), "done")
  assert.equal(itemState(row({ status: "cancelled" })), "set-aside")
})

t("a default name is not a name", () => {
  assert.equal(routing(row({ askedBy: "mcp-client" })).askedBy, null)
  assert.equal(routing(row({ metadata: { askedFrom: "/work/planner" } })).askedFrom, "/work/planner")
})

t("the asker may always claim its own answer; nobody claims before he answers", () => {
  assert.deepEqual(mayClaim(row(), { agent: "Claude-Code@Planner", now: NOW }), { ok: true, takenOver: false })
  const w = mayClaim(row({ status: "awaiting-unlock" }), { agent: "claude-code@planner", now: NOW })
  assert.equal(w.ok, false)
})

t("another agent on the project waits out the grace period, then may take it", () => {
  const early = mayClaim(row(), { agent: "other", projectId: "p1", now: NOW })
  assert.equal(early.ok, false); assert.match((early as { why: string }).why, /after 20 minutes \(10 to go\)/)
  assert.deepEqual(mayClaim(row({ answeredAt: "2026-11-15T00:30:00Z" }), { agent: "other", projectId: "p1", now: NOW }), { ok: true, takenOver: true })
})

t("an agent on the key the question was asked on claims at once, whatever name it gives", () => {
  const asked = row({ askedBy: "key: Claude Code MCP Key", metadata: { apiKeyId: "k1" } })
  assert.deepEqual(mayClaim(asked, { agent: "claude-code@planner", projectId: "p1", now: NOW, keyId: "k1" }), { ok: true, takenOver: false })
  assert.equal(mayClaim(asked, { agent: "claude-code@planner", projectId: "p1", now: NOW, keyId: "k2" }).ok, false, "another key still waits")
  assert.equal(mayClaim(asked, { agent: "claude-code@planner", projectId: "p1", now: NOW }).ok, false, "no key known: still waits")
  assert.equal(mayClaim(row({ metadata: { apiKeyId: "k1", claimedBy: "x", claimedAt: "2026-11-15T00:59:00Z" } }), { agent: "y", now: NOW, keyId: "k1" }).ok, false, "never takes a claim another agent holds")
  assert.equal(mayClaim(asked, { agent: "mcp-client", now: NOW, keyId: "k1" }).ok, false, "still needs a name")
})

t("an agent on a different project, or with no name, is refused", () => {
  assert.equal(mayClaim(row({ answeredAt: "2026-11-14T00:00:00Z" }), { agent: "other", projectId: "p2", now: NOW }).ok, false)
  assert.equal(mayClaim(row(), { agent: "mcp-client", projectId: "p1", now: NOW }).ok, false)
  assert.equal(mayClaim(row(), { agent: "  ", projectId: "p1", now: NOW }).ok, false)
})

t("leaving the project out says so, rather than calling it a different project", () => {
  const r = mayClaim(row({ askedBy: "mcp-client" }), { agent: "other", now: NOW })
  assert.equal(r.ok, false); assert.match((r as { why: string }).why, /pass projectId p1/)
  const r2 = mayClaim(row(), { agent: "other", now: NOW })
  assert.match((r2 as { why: string }).why, /pass projectId p1, or claim it as claude-code@planner/)
})

t("an answer nobody is recorded as asking goes to the project at once", () => {
  assert.deepEqual(mayClaim(row({ askedBy: "mcp-client" }), { agent: "other", projectId: "p1", now: NOW }), { ok: true, takenOver: false })
})

t("a claimed answer stays with its agent unless the claim went stale", () => {
  const held = row({ metadata: { claimedBy: "a", claimedAt: "2026-11-15T00:55:00Z" } })
  assert.equal(mayClaim(held, { agent: "b", projectId: "p1", now: NOW }).ok, false)
  assert.deepEqual(mayClaim(held, { agent: "A", now: NOW }), { ok: true, takenOver: false })
  const old = row({ metadata: { claimedBy: "a", claimedAt: "2026-11-13T00:00:00Z" } })
  assert.deepEqual(mayClaim(old, { agent: "b", projectId: "p1", now: NOW }), { ok: true, takenOver: true })
  assert.equal(mayClaim(old, { agent: "b", projectId: "p2", now: NOW }).ok, false)
})

t("claiming keeps what was recorded and adds who and when", () => {
  const m = claimPatch({ askedFrom: "/work/planner" }, { agent: " a ", from: "/work/byb", now: NOW })
  assert.deepEqual(m, { askedFrom: "/work/planner", claimedBy: "a", claimedAt: "2026-11-15T01:00:00.000Z", claimedFrom: "/work/byb" })
})

t("finished needs a claim by the same agent and a sentence saying what was done", () => {
  const held = row({ metadata: { claimedBy: "a", claimedAt: "2026-11-15T00:55:00Z" } })
  assert.throws(() => donePatch(row(), { agent: "a", note: "Shipped the fix to production and verified it.", now: NOW }), QueueError)
  assert.throws(() => donePatch(held, { agent: "b", note: "Shipped the fix to production and verified it.", now: NOW }), QueueError)
  assert.throws(() => donePatch(held, { agent: "a", note: "ok", now: NOW }), QueueError)
  const m = donePatch(held, { agent: "A", note: "Shipped the fix to production and verified it.", now: NOW })
  assert.equal(m.doneAt, "2026-11-15T01:00:00.000Z"); assert.equal(m.claimedBy, "a")
  assert.throws(() => donePatch(row({ metadata: m }), { agent: "a", note: "Shipped the fix to production and verified it.", now: NOW }), QueueError)
})

t("the owner is told in one line where his answer went", () => {
  assert.equal(whereItWent(row(), NOW), "Not picked up yet (asked by claude-code@planner). You answered 10 min ago.")
  assert.equal(whereItWent(row({ metadata: { claimedBy: "a", claimedAt: "2026-11-15T00:55:00Z" } }), NOW), "Picked up by a 5 min ago. Not finished yet.")
  assert.match(whereItWent(row({ metadata: { claimedBy: "a", doneAt: "2026-11-15T00:59:30Z", doneNote: "Hid the link on staging." } }), NOW), /^Finished by a (just now|1 min ago): Hid the link on staging\.$/)
})

t("an answer the planner carried out itself is finished, and says what it did", () => {
  const base: ItemRow = { status: "completed", askedBy: null, projectId: "p1", answeredAt: "2026-11-14T17:14:00Z", metadata: {} }
  assert.equal(itemState(base), "unclaimed")
  const what = planChangeNote({ action: "add", label: "Export catalog", route: "/catalog", status: "approved" })
  assert.equal(what, '"Export catalog" is in the plan for /catalog.')
  assert.equal(planChangeNote({ action: "remove", label: "Impact graph", route: "/catalog", status: "approved" }), '"Impact graph" is out of the plan for /catalog.')
  assert.equal(planChangeNote({ action: "add", label: "X", route: "/catalog", status: "rejected" }), "The plan for /catalog was left as it was.")
  assert.equal(planChangeNote({ action: "add", label: "X", route: "/catalog", status: "waiting" }), null)
  const row = { ...base, applied: { at: "2026-11-14T23:11:00Z", what: what! } }
  assert.equal(itemState(row), "done")
  assert.equal(whereItWent(row, new Date("2026-11-14T23:41:00Z").getTime()), 'Carried out by the planner 30 min ago: "Export catalog" is in the plan for /catalog.')
  const refused = mayClaim(row, { agent: "builder", projectId: "p1", now: Date.now() })
  assert.equal(refused.ok, false)
  // An agent's own finish still reads as the agent's.
  assert.match(whereItWent({ ...base, metadata: { claimedBy: "builder", doneAt: "2026-11-14T23:11:00Z", doneNote: "Did the thing asked for." } }, new Date("2026-11-14T23:41:00Z").getTime()), /^Finished by builder/)
})

t("an answer can be taken back only while nothing has acted on it", () => {
  const base: ItemRow = { status: "completed", askedBy: "builder", projectId: "p1", answeredAt: "2026-11-14T17:14:00Z", metadata: {} }
  assert.deepEqual(mayUndo(base), { ok: true })
  assert.equal(mayUndo({ ...base, status: "awaiting-unlock" }).ok, false)
  const claimed = mayUndo({ ...base, metadata: { claimedBy: "builder", claimedAt: "2026-11-14T17:20:00Z" } })
  assert.equal(claimed.ok, false); assert.match((claimed as { why: string }).why, /builder has already picked this up/)
  assert.equal(mayUndo({ ...base, metadata: { claimedBy: "builder", doneAt: "x", doneNote: "y" } }).ok, false)
  assert.match((mayUndo({ ...base, applied: { at: null, what: "in the plan" } }) as { why: string }).why, /planner has already carried this out/)
  assert.match((mayUndo({ ...base, status: "queued" }) as { why: string }).why, /paused job/)
  const m = undoPatch({ askedFrom: "/work" }, { was: "Merge", now: new Date("2026-11-15T12:00:00Z").getTime() })
  assert.equal(m.askedFrom, "/work")
  assert.deepEqual(m.takenBack, [{ at: "2026-11-15T12:00:00.000Z", was: "Merge" }])
  assert.equal((undoPatch(m, { was: "Keep", now: 0 }).takenBack as unknown[]).length, 2)
})

t("a held call wakes only for unpicked answers the caller has not been handed", () => {
  const items = [{ questionId: "a", state: "unclaimed" }, { questionId: "b", state: "claimed" }, { questionId: "c", state: "unclaimed" }]
  assert.deepEqual(wakeFor(items).map((i) => i.questionId), ["a", "c"])
  assert.deepEqual(wakeFor(items, ["a"]).map((i) => i.questionId), ["c"])
  assert.deepEqual(wakeFor(items, ["a", "c", "zz"]), [])
})

console.log(`\n${n} item-state checks passed`)
