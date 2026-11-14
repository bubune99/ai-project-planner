import assert from "node:assert/strict"
import { EVIDENCE_DAYS, allChecks, checkKey, checkState, controlProgress, diffChecklists, hookLine, imagesToExpire, nextCheck, summarize, validateChecklist, type CheckState, type Checklist, type Result, type StoredImage } from "./gate-model"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

const step = { do: "Click it", expect: "It opens", there: ["The panel"], gone: [] }
const list: Checklist = {
  route: "/catalog",
  views: [
    { key: "page", name: "Page", w: 1000, h: 400, controls: [
      { n: 1, label: "Menu", kind: "Button", x: 10, y: 10, w: 80, h: 30, shared: true, states: ["Dark", "Light"], workflows: [{ name: "Open", steps: [step] }, { name: "Close", steps: [step] }] },
      { n: 2, label: "Impact graph", kind: "Link", x: 900, y: 60, w: 90, h: 30, states: ["Signed in"], workflows: [{ name: "Go", steps: [step] }] },
    ] },
    { key: "menu", name: "Menu open", w: 300, h: 600, controls: [
      { n: 3, label: "Dashboard", kind: "Link", x: 10, y: 100, w: 200, h: 30, states: ["Signed in"], workflows: [{ name: "Go", steps: [step] }] },
    ] },
  ],
}
const R = (key: string, actor: Result["actor"], status: Result["status"], at: string): Result => ({ key, actor, status, at })
const k = (i: number) => allChecks(list)[i].key

ok("a control has one check per workflow per state, in working order", () => {
  const all = allChecks(list)
  assert.equal(all.length, 2 * 2 + 1 + 1)
  assert.deepEqual(all.map((c) => c.key), ["1|Open|Dark", "1|Open|Light", "1|Close|Dark", "1|Close|Light", "2|Go|Signed in", "3|Go|Signed in"])
  assert.equal(all[5].view, "menu")
  assert.equal(checkKey(1, "Open", "Dark"), all[0].key)
})

ok("a sound checklist has no issues; broken ones say what is wrong", () => {
  assert.deepEqual(validateChecklist(list), [])
  const bad = (edit: (l: Checklist) => void) => { const copy = structuredClone(list); edit(copy); return validateChecklist(copy).map((i) => i.message).join(" / ") }
  assert.match(bad((l) => { l.route = "catalog" }), /start with \//)
  assert.match(bad((l) => { l.views = [] }), /at least one view/)
  assert.match(bad((l) => { l.views[1].controls[0].n = 1 }), /share this number/)
  assert.match(bad((l) => { l.views[0].controls[0].states = [] }), /at least one state/)
  assert.match(bad((l) => { l.views[0].controls[0].workflows = [] }), /at least one workflow/)
  assert.match(bad((l) => { l.views[0].controls[0].workflows[1].name = "Open" }), /named "Open"/)
  assert.match(bad((l) => { l.views[0].controls[0].workflows[0].steps = [] }), /at least one step/)
  assert.match(bad((l) => { l.views[0].controls[0].states = ["a|b"] }), /cannot contain/)
  assert.match(bad((l) => { l.views[0].controls[1].x = 990 }), /outside its view/)
})

ok("a lone verdict stands, agreeing verdicts stand, differing ones are disputed", () => {
  assert.equal(checkState([], k(0)), "pending")
  assert.equal(checkState([R(k(0), "builder", "passed", "2026-11-13T10:00:00Z")], k(0)), "passed")
  assert.equal(checkState([R(k(0), "builder", "passed", "2026-11-13T10:00:00Z"), R(k(0), "reviewer", "passed", "2026-11-13T11:00:00Z")], k(0)), "passed")
  assert.equal(checkState([R(k(0), "builder", "passed", "2026-11-13T10:00:00Z"), R(k(0), "reviewer", "failed", "2026-11-13T11:00:00Z")], k(0)), "disputed")
  assert.equal(checkState([R(k(0), "builder", "failed", "2026-11-13T10:00:00Z")], k(0)), "failed")
})

ok("the latest verdict from each actor is the one that counts", () => {
  const rs = [R(k(0), "builder", "failed", "2026-11-13T10:00:00Z"), R(k(0), "builder", "passed", "2026-11-13T12:00:00Z")]
  assert.equal(checkState(rs, k(0)), "passed")
  assert.equal(checkState([...rs].reverse(), k(0)), "passed")
})

ok("the owner settles it, and only the owner can waive", () => {
  const dispute = [R(k(0), "builder", "passed", "2026-11-13T10:00:00Z"), R(k(0), "reviewer", "failed", "2026-11-13T11:00:00Z")]
  assert.equal(checkState([...dispute, R(k(0), "owner", "failed", "2026-11-13T12:00:00Z")], k(0)), "failed")
  assert.equal(checkState([...dispute, R(k(0), "owner", "waived", "2026-11-13T12:00:00Z")], k(0)), "waived")
  // A builder's "waived" is not a verdict at all.
  assert.equal(checkState([R(k(0), "builder", "waived", "2026-11-13T10:00:00Z")], k(0)), "pending")
})

ok("the summary counts every check once and is done only when all are cleared", () => {
  const rs = [R(k(0), "builder", "passed", "t1"), R(k(1), "builder", "failed", "t1"), R(k(2), "builder", "passed", "t1"), R(k(2), "reviewer", "failed", "t2"), R(k(3), "owner", "waived", "t1")]
  const s = summarize(list, rs)
  assert.deepEqual({ ...s }, { total: 6, cleared: 2, passed: 1, waived: 1, failed: 1, disputed: 1, pending: 2, reviewed: 1, done: false })
  assert.equal(s.passed + s.waived + s.failed + s.disputed + s.pending, s.total)
  const all = allChecks(list).map((c) => R(c.key, "builder", "passed", "t1"))
  assert.equal(summarize(list, all).done, true)
  assert.equal(summarize({ ...list, views: [{ ...list.views[0], controls: [] }] }, []).done, false)
})

ok("next sends the builder to failures first, then untouched checks, and to nothing when all are cleared", () => {
  assert.equal(nextCheck(list, [])?.key, k(0))
  assert.equal(nextCheck(list, [R(k(0), "builder", "passed", "t1")])?.key, k(1))
  assert.equal(nextCheck(list, [R(k(0), "builder", "passed", "t1"), R(k(4), "builder", "failed", "t1")])?.key, k(4))
  // A disputed check waits for the owner: untouched ones come before it.
  const dispute = [R(k(0), "builder", "passed", "t1"), R(k(0), "reviewer", "failed", "t2")]
  assert.equal(nextCheck(list, dispute)?.key, k(1))
  const rest = allChecks(list).slice(1).map((c) => R(c.key, "builder", "passed", "t1"))
  assert.equal(nextCheck(list, [...dispute, ...rest])?.state_now, "disputed")
  assert.equal(nextCheck(list, allChecks(list).map((c) => R(c.key, "builder", "passed", "t1"))), null)
})

ok("the hook line names the exact next check and never lets the agent finish early", () => {
  assert.match(hookLine(list, []), /^0 of 6 checks cleared on \/catalog\. Next: control 1, Menu: "Open" in "Dark"\. You cannot finish/)
  assert.match(hookLine(list, [R(k(1), "builder", "failed", "t1")]), /control 1, Menu: "Open" in "Light"\. It failed last time/)
  assert.match(hookLine(list, allChecks(list).map((c) => R(c.key, "builder", "passed", "t1"))), /^All 6 checks on \/catalog are cleared\. You may finish/)
})

ok("a control's progress counts its own checks and reports its worst state", () => {
  const c = list.views[0].controls[0]
  assert.deepEqual(controlProgress(c, []), { cleared: 0, total: 4, worst: "pending" })
  assert.deepEqual(controlProgress(c, [R(k(0), "builder", "passed", "t1"), R(k(1), "builder", "failed", "t1")]), { cleared: 1, total: 4, worst: "failed" })
  assert.equal(controlProgress(c, [0, 1, 2, 3].map((i) => R(k(i), "builder", "passed", "t1"))).worst, "passed")
})

ok("parity: a new version reports the controls that appeared and the ones that are gone", () => {
  assert.deepEqual(diffChecklists(null, list), { added: [], removed: [], kept: 0 })
  const next = structuredClone(list)
  next.views[0].controls.pop()
  next.views[1].controls.push({ ...list.views[1].controls[0], n: 4, label: "Projects" })
  const d = diffChecklists(list, next)
  assert.deepEqual(d.removed, [{ view: "page", label: "Impact graph", kind: "Link" }])
  assert.deepEqual(d.added, [{ view: "menu", label: "Projects", kind: "Link" }])
  assert.equal(d.kept, 2)
  // Moving a control to another view counts as gone from one and new in the other.
  const moved = structuredClone(list)
  moved.views[1].controls.push({ ...moved.views[0].controls.pop()!, x: 10, y: 200 })
  assert.equal(diffChecklists(list, moved).removed.length, 1)
  assert.equal(diffChecklists(list, moved).added.length, 1)
})

ok("pictures: view pictures stay for this version and the one before; evidence is short-lived", () => {
  const now = new Date("2026-11-13T12:00:00Z")
  const days = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString()
  const img = (id: string, kind: StoredImage["kind"], version: number, key: string, age: number): StoredImage => ({ id, kind, version, key, capturedAt: days(age) })
  const state = (key: string): CheckState => (key === "failed-key" ? "failed" : key === "disputed-key" ? "disputed" : "passed")
  const images = [
    img("x3", "extract", 3, "page", 0), img("x1", "extract", 1, "page", 50), img("v3", "view", 3, "page", 0), img("v3-old", "view", 3, "page", 1), img("v2", "view", 2, "page", 20), img("v1", "view", 1, "page", 40),
    img("e-new", "evidence", 3, "a", 1), img("e-old", "evidence", 3, "b", EVIDENCE_DAYS + 1), img("e-dup-old", "evidence", 3, "a", 2),
    img("e-failed", "evidence", 3, "failed-key", 30), img("e-disputed", "evidence", 3, "disputed-key", 30), img("e-prev", "evidence", 2, "a", 0),
  ]
  const gone = imagesToExpire(images, 3, state, now).sort()
  assert.deepEqual(gone, ["e-dup-old", "e-old", "e-prev", "v1", "v3-old", "x1"])
  assert.equal(EVIDENCE_DAYS, 3)
  assert.deepEqual(imagesToExpire([], 1, state, now), [])
})

console.log(`\n${n} checks passed`)
