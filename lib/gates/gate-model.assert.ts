import assert from "node:assert/strict"
import { scanFindings } from "./gate-model"
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

ok("a control the scan found unsound starts as a failed check, so the agent is sent to it first", () => {
  const flawed = structuredClone(list)
  flawed.views[0].controls[1].issues = ["the link goes nowhere", "it is 12 by 12 pixels"]
  const found = scanFindings(flawed)
  assert.deepEqual(found, [{ key: "2|Go|Signed in", note: "Found by the scan: the link goes nowhere; it is 12 by 12 pixels." }])
  assert.deepEqual(scanFindings(list), [])
  const results = found.map((f) => R(f.key, "builder", "failed", "t1"))
  assert.equal(nextCheck(flawed, results)?.key, "2|Go|Signed in")
  assert.equal(summarize(flawed, results).failed, 1)
})

// ── The plan ────────────────────────────────────────────────────────────────
import { comparePlan, decideChange, isSensitive, planClear, planLine, validateChange, type Expected, type PlanChange } from "./gate-model"

const E = (id: string, label: string, source: Expected["source"] = "mockup", extra: Partial<Expected> = {}): Expected => ({ id, label, must: "Does its job", source, ...extra })
const plan = [E("a", "Menu"), E("b", "impact  GRAPH", "mockup", { kind: "Link" }), E("c", "Dashboard", "mockup", { view: "menu" }), E("d", "Export"), E("e", "Filters", "agent")]

ok("plan: a scan is split into matched, missing, waiting on the owner, and unplanned", () => {
  const c = comparePlan(plan, list, ["e"])
  assert.deepEqual(c.matched.map((m) => [m.expected.id, m.n]), [["a", 1], ["b", 2], ["c", 3]])
  assert.deepEqual(c.missing.map((e) => e.id), ["d"])
  assert.deepEqual(c.waiting.map((e) => e.id), ["e"])
  assert.deepEqual(c.unplanned, [])
  assert.equal(planClear(c), false)
  // Kind and view only count when the plan names them, and then they must agree.
  assert.equal(comparePlan([E("x", "Impact graph", "mockup", { kind: "Button" })], list).missing.length, 1)
  assert.equal(comparePlan([E("x", "Dashboard", "mockup", { view: "page" })], list).missing.length, 1)
  // One control cannot answer two expectations.
  assert.equal(comparePlan([E("x", "Menu"), E("y", "Menu")], list).missing.length, 1)
  // Everything on the page that the plan does not name is unplanned.
  assert.deepEqual(comparePlan([E("a", "Menu")], list).unplanned.map((u) => u.label), ["Impact graph", "Dashboard"])
  assert.equal(planClear(comparePlan(plan.slice(0, 3), list)), true)
  // A flagged piece of text or a card is a finding about content, not an unplanned control.
  const withContent = structuredClone(list)
  withContent.views[0].controls.push({ n: 9, label: "Net worth", kind: "Text", x: 1, y: 1, w: 50, h: 12, states: ["Dark"], workflows: [{ name: "Read it", steps: [step] }] }, { n: 10, label: "Budget targets", kind: "Card", x: 1, y: 100, w: 300, h: 200, states: ["Dark"], workflows: [{ name: "Look at its layout", steps: [step] }] })
  assert.equal(planClear(comparePlan(plan.slice(0, 3), withContent)), true)
})

ok("plan: the hook says what is missing and what nobody planned, and is silent when clear", () => {
  assert.equal(planLine(comparePlan(plan.slice(0, 3), list)), "")
  const line = planLine(comparePlan([E("a", "Menu"), E("d", "Export")], list))
  assert.match(line, /^Against the plan: 1 planned control is not on the page \(Export\): build it, or propose removing it/)
  assert.match(line, /2 controls are on the page but not in the plan \(Impact graph, Dashboard\)/)
  assert.match(planLine(comparePlan([...plan.slice(0, 3), E("e", "Filters", "agent")], list, ["e"])), /^1 planned control waiting on the owner's answer \(Filters\); carry on/)
})

ok("plan: a change needs a real reason, and a claim that the owner asked needs their words", () => {
  const p = (o: Partial<PlanChange>): PlanChange => ({ action: "add", item: E("n", "Sort"), reason: "The mock-up shows a sort control above the list", basis: "evidence", ...o })
  assert.deepEqual(validateChange(p({})), [])
  assert.match(validateChange(p({ reason: "because" }))[0].message, /reason/)
  assert.match(validateChange(p({ basis: "owner_asked" }))[0].message, /owner's words/)
  assert.match(validateChange(p({ item: { ...E("n", "Sort"), must: "" } }))[0].message, /what it must do/)
})

ok("plan: the owner is included when their request, the rules and common sense say so, and not otherwise", () => {
  const ctx = { shipped: false, labels: ["Menu", "Library"] }
  const p = (o: Partial<PlanChange>): PlanChange => ({ action: "remove", item: E("x", "SOPs"), reason: "It duplicates the Library page", basis: "judgment", ...o })
  // Their own words settle it, even for something sensitive and shipped.
  assert.equal(decideChange(p({ basis: "owner_asked", quote: "sops and library can probably be merged together", item: E("x", "Delete project") }), { ...ctx, shipped: true }).needsOwner, false)
  // Adding only makes the checks stricter...
  assert.equal(decideChange(p({ action: "add", item: E("n", "Sort") }), ctx).needsOwner, false)
  // ...unless it is about access, money or destroying data.
  for (const label of ["Delete project", "Invite a collaborator", "Change price", "Export all data"]) assert.equal(decideChange(p({ action: "add", item: E("n", label) }), ctx).needsOwner, true, label)
  // A control replaced by another planned one is not lost.
  assert.equal(decideChange(p({ replacedBy: "library" }), ctx).needsOwner, false)
  assert.equal(decideChange(p({ replacedBy: "Somewhere else" }), ctx).needsOwner, true)
  // An agent may withdraw its own guess before the page ships, not after.
  assert.equal(decideChange(p({ item: E("x", "Filters", "agent") }), ctx).needsOwner, false)
  assert.equal(decideChange(p({ item: E("x", "Filters", "agent") }), { ...ctx, shipped: true }).needsOwner, true)
  // What the owner's plan asked for stays until the owner says otherwise.
  for (const source of ["owner", "mockup", "flow"] as const) assert.equal(decideChange(p({ item: E("x", "SOPs", source) }), ctx).needsOwner, true, source)
  assert.equal(isSensitive(p({ item: E("x", "Refund order") })), true)
  assert.equal(isSensitive(p({})), false)
  // Every answer says why.
  assert.ok(decideChange(p({}), ctx).why.length > 20)
})

console.log(`${n} checks passed in all`)
