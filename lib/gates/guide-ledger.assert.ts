import assert from "node:assert/strict"
import { contentOf, ruleId, toRules, type Guide, type GuideVersion } from "./guides"
import { ledgerOf, ledgerWords, type CheckRecord } from "./guide-ledger"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const S = (o: Partial<Guide> = {}): Guide => ({
  id: "1", kind: "statement", name: "Phone screens", summary: "Works at 390px", applies: { files: ["**/*.tsx"] },
  checks: [{ id: "fits", say: "Nothing is cut off at 390px" }, { id: "taps", say: "Every target is 44px", auto: "forbids:h-6" }],
  status: "active", source: "owner", basis: "Owner, 2026-11-14", ...o,
})
const V = (version: number, c: Partial<Guide> = {}, o: Partial<GuideVersion> = {}): GuideVersion => ({ version, at: `2026-11-${10 + version}T12:00:00.000Z`, by: { kind: "owner" }, change: "saved", content: contentOf(S(c)), ...o })
const R = (check: string, result: CheckRecord["result"], day: number, file = "app/x.tsx"): CheckRecord => ({ rule: ruleId("Phone screens", check), file, at: `2026-11-${day}T09:00:00.000Z`, result })
const day = (iso: string) => iso.slice(0, 10)
const row = (c: Partial<Guide> = {}, updatedAt: string | null = "2026-11-09T08:00:00.000Z") => ({ ...contentOf(S(c)), updatedAt })

ok("a check's rule id is the one the plugin is given", () => {
  assert.deepEqual([...new Set(toRules([S()]).map((r) => r.id))], [ruleId("Phone screens", "fits"), ruleId("Phone screens", "taps")])
  assert.equal(ruleId("No monospace type", "none"), "no-monospace-type-none")
})

ok("nothing recorded is not a clean record: no counts at all, and the words carry no zero", () => {
  const l = ledgerOf(row(), [V(1)], [])
  assert.equal(l.checks, null)
  const w = ledgerWords(l, day)
  assert.equal(w.checks, "No checks recorded yet.")
  assert.ok(!/\b0\b/.test(w.checks))
  // Records of another statement's checks are not this one's.
  assert.equal(ledgerOf(row(), [V(1)], [{ rule: ruleId("US English", "fits"), file: "a.tsx", at: "2026-11-12T09:00:00.000Z", result: "passed" }]).checks, null)
})

ok("checked and none passed is a number, and is told apart from nothing recorded", () => {
  const l = ledgerOf(row(), [V(1)], [R("fits", "failed", 12), R("taps", "failed", 13, "app/y.tsx")])
  assert.deepEqual(l.checks, { owed: 2, passed: 0, failed: 2, waived: 0, open: 0, lastFailed: { at: "2026-11-13T09:00:00.000Z", file: "app/y.tsx" } })
  assert.equal(ledgerWords(l, day).checks, "Checked 2 times: 0 passed, 2 failed. Last failed 2026-11-13 on app/y.tsx.")
})

ok("owed, passed, failed, waived and still owed are counted; the last failure says when and where", () => {
  const l = ledgerOf(row(), [V(1)], [R("fits", "passed", 12), R("fits", "failed", 14, "app/a.tsx"), R("taps", "failed", 13, "app/b.tsx"), R("taps", "waived", 15), R("fits", "open", 16), R("fits", "passed", 17)])
  assert.deepEqual(l.checks, { owed: 6, passed: 2, failed: 2, waived: 1, open: 1, lastFailed: { at: "2026-11-14T09:00:00.000Z", file: "app/a.tsx" } })
  assert.equal(ledgerWords(l, day).checks, "Checked 6 times: 2 passed, 2 failed, 1 waived, 1 still owed. Last failed 2026-11-14 on app/a.tsx.")
  const one = ledgerOf(row(), [V(1)], [R("fits", "passed", 12)])
  assert.equal(ledgerWords(one, day).checks, "Checked 1 time: 1 passed, 0 failed.")
})

ok("in force in its current wording since the first version of the unbroken run that reads the same", () => {
  // v1 old wording, v2 new wording, v3 only put on trial (same wording), v4 only moved the review date.
  const vs = [V(1, { summary: "Old" }), V(2), V(3, { trialUntil: "2026-11-30" }, { change: "trial" }), V(4, { trialUntil: "2026-12-05" }, { change: "trial" })]
  const l = ledgerOf(row({ trialUntil: "2026-12-05" }), vs, [])
  assert.deepEqual(l.since, { at: V(2).at, atLeast: false })
  assert.equal(l.inForce, true)
  assert.equal(ledgerWords(l, day).wording, "In force in this wording since 2026-11-12.")
  // Reworded and then worded back: the run starts again at the newest change.
  const back = ledgerOf(row(), [V(1), V(2, { summary: "Other" }), V(3)], [])
  assert.deepEqual(back.since, { at: V(3).at, atLeast: false })
  // The name is the key: a save that spells its capitals differently is not new wording.
  assert.equal(ledgerOf(row(), [V(1, { name: "PHONE screens" }), V(2)], []).since?.at, V(1).at)
  // A check reworded counts as new wording.
  const reworded = ledgerOf(row(), [V(1, { checks: [{ id: "fits", say: "Fits" }] }), V(2)], [])
  assert.equal(reworded.since?.at, V(2).at)
})

ok("set aside and made a rule again: in force only since it was made a rule again; a draft is not in force", () => {
  const l = ledgerOf(row(), [V(1), V(2, { status: "draft" }, { change: "status" }), V(3, {}, { change: "status" })], [])
  assert.deepEqual(l.since, { at: V(3).at, atLeast: false })
  const draft = ledgerOf(row({ status: "draft" }), [V(1), V(2, { status: "draft" }, { change: "status" })], [])
  assert.equal(draft.inForce, false)
  assert.equal(ledgerWords(draft, day).wording, "A draft since 2026-11-12: not in force.")
})

ok("history not kept yet: since at least the row's last write, never an exact date nobody recorded", () => {
  const none = ledgerOf(row(), [], [])
  assert.deepEqual(none.since, { at: "2026-11-09T08:00:00.000Z", atLeast: true })
  assert.equal(ledgerWords(none, day).wording, "In force in this wording since at least 2026-11-09.")
  // The state kept as "before history was kept" is a floor too.
  const before = ledgerOf(row(), [V(1, {}, { change: "before", by: { kind: "before" } })], [])
  assert.equal(before.since?.atLeast, true)
  // Nothing to go on at all: a dash, not a date.
  assert.equal(ledgerOf(row({}, null), [], []).since, null)
  assert.equal(ledgerWords(ledgerOf(row({}, null), [], []), day).wording, "In force in this wording since –.")
})

ok("on trial: the same numbers since the trial began; moving the review date does not restart it", () => {
  const vs = [V(1), V(2, { trialUntil: "2026-11-30" }, { change: "trial" }), V(3, { trialUntil: "2026-12-05" }, { change: "trial" })]
  const recs = [R("fits", "failed", 11), R("fits", "passed", 13), R("taps", "passed", 14)]
  const l = ledgerOf(row({ trialUntil: "2026-12-05" }), vs, recs)
  assert.equal(l.trial?.since, V(2).at)
  assert.deepEqual(l.trial?.checks, { owed: 2, passed: 2, failed: 0, waived: 0, open: 0, lastFailed: null })
  assert.equal(l.checks?.owed, 3)
  assert.equal(ledgerWords(l, day).trial, "Since the trial began 2026-11-12: checked 2 times: 2 passed, 0 failed.")
  // On trial with nothing recorded since: said so, not shown as a clean run.
  const quiet = ledgerOf(row({ trialUntil: "2026-12-05" }), vs, [R("fits", "failed", 11)])
  assert.equal(quiet.trial?.checks, null)
  assert.equal(ledgerWords(quiet, day).trial, "Since the trial began 2026-11-12: no checks recorded yet.")
  // Made permanent and put on trial again: the trial began at the second time.
  const again = ledgerOf(row({ trialUntil: "2026-12-20" }), [...vs, V(4, {}, { change: "permanent" }), V(5, { trialUntil: "2026-12-20" }, { change: "trial" })], [])
  assert.equal(again.trial?.since, V(5).at)
})

ok("permanent has no trial line; a trial whose start was not kept says so and counts nothing", () => {
  assert.equal(ledgerOf(row(), [V(1)], []).trial, null)
  assert.equal(ledgerWords(ledgerOf(row(), [V(1)], []), day).trial, null)
  const lost = ledgerOf(row({ trialUntil: "2026-12-05" }), [], [R("fits", "passed", 13)])
  assert.deepEqual(lost.trial, { since: null, checks: null })
  assert.equal(ledgerWords(lost, day).trial, "Since the trial began: –")
})

console.log(`\n${n} checks passed`)
