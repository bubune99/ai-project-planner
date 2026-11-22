import assert from "node:assert/strict"
import { ruleId } from "./guides"
import { guideForRule, parseResults, summarize, tableMissing, toRecords, MAX_BATCH, MAX_FILE, type GuideKey, type TallyRow } from "./code-results"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const NOW = "2026-11-22T15:00:00.000Z"
const agent = { now: NOW, asOwner: false }
const owner = { now: NOW, asOwner: true }
const one = (o: Record<string, unknown> = {}) => ({ rule: "us-english-spelling", file: "app/page.tsx", status: "passed", ...o })
const parsed = (raw: unknown, who = agent) => { const p = parseResults(raw, who); if (!p.ok) throw new Error(p.error); return p }
const refused = (raw: unknown, who = agent) => { const p = parseResults(raw, who); if (p.ok) throw new Error("was accepted"); return p }

ok("a batch is read: rule, file, status, note, when; a time not sent is now", () => {
  const p = parsed({ results: [one({ note: "  read it  ", at: "2026-11-22T14:00:00Z" }), one({ file: "lib/a.ts", status: "failed", note: "line 3" })], agentName: " builder-2 ", source: "verify" })
  assert.deepEqual(p.results, [
    { rule: "us-english-spelling", file: "app/page.tsx", status: "passed", note: "read it", at: "2026-11-22T14:00:00.000Z" },
    { rule: "us-english-spelling", file: "lib/a.ts", status: "failed", note: "line 3", at: NOW },
  ])
  assert.equal(p.who, "builder-2")
  assert.equal(p.source, "verify")
  assert.equal(p.actor, "agent")
})

ok("who saved it: a browser session is the owner unless it says agent; an API key is always an agent", () => {
  assert.equal(parsed({ results: [one()] }, owner).actor, "owner")
  assert.equal(parsed({ results: [one()], agent: true, agentName: "x" }, owner).actor, "agent")
  assert.equal(parsed({ results: [one()], agent: false }, agent).actor, "agent")
  // An owner's own save carries no agent name, whatever was sent.
  assert.equal(parsed({ results: [one()], agentName: "x" }, owner).who, "")
  assert.equal(parsed({ results: [one()], agentName: "y".repeat(200) }).who.length, 80)
})

ok("the plugin's own word for still owed (open) is taken as owed; any other status is refused", () => {
  assert.equal(parsed({ results: [one({ status: "open" })] }).results[0].status, "owed")
  assert.equal(parsed({ results: [one({ status: "owed" })] }).results[0].status, "owed")
  assert.match(refused({ results: [one({ status: "fine" })] }).error, /result 1: status is owed, passed, failed or waived/)
})

ok("only the owner, signed in, can waive, and says why", () => {
  const no = refused({ results: [one({ status: "waived", note: "the owner said so" })] })
  assert.equal(no.status, 403)
  assert.match(no.error, /Only the owner/)
  assert.equal(refused({ results: [one({ status: "waived", note: "ok" })], agent: true }, owner).status, 403)
  assert.match(refused({ results: [one({ status: "waived" })] }, owner).error, /needs a note/)
  assert.equal(parsed({ results: [one({ status: "waived", note: "Generated file" })] }, owner).results[0].status, "waived")
})

ok("a file is a path inside the project: no absolute path, no climbing out, capped in length", () => {
  assert.equal(parsed({ results: [one({ file: "./app\\api\\x.ts" })] }).results[0].file, "app/api/x.ts")
  for (const file of ["/etc/passwd", "C:\\Users\\x\\a.ts", "../other/a.ts", "app/../../a.ts", "", "a\nb.ts", "x".repeat(MAX_FILE + 1), 7])
    assert.match(refused({ results: [one({ file })] }).error, /result 1: file/, String(file))
  assert.equal(parsed({ results: [one({ file: "x".repeat(MAX_FILE) })] }).results[0].file.length, MAX_FILE)
})

ok("a rule id is short and has no spaces; a note is cut to length; a bad time is refused; a time ahead of now is now", () => {
  for (const rule of ["", "two words", "x".repeat(201), null]) assert.match(refused({ results: [one({ rule })] }).error, /result 1: rule/)
  assert.equal(parsed({ results: [one({ rule: "impact" })] }).results[0].rule, "impact")
  assert.equal(parsed({ results: [one({ note: "n".repeat(3000) })] }).results[0].note?.length, 1000)
  assert.equal(parsed({ results: [one({ note: "   " })] }).results[0].note, null)
  assert.match(refused({ results: [one({ at: "yesterday" })] }).error, /result 1: at/)
  assert.equal(parsed({ results: [one({ at: "2026-11-23T15:00:00Z" })] }).results[0].at, NOW)
  // A little ahead is a clock that differs, and is kept.
  assert.equal(parsed({ results: [one({ at: "2026-11-22T15:01:00Z" })] }).results[0].at, "2026-11-22T15:01:00.000Z")
})

ok("nothing to save, something that is not a list, and too many at once are refused with a sentence", () => {
  for (const raw of [null, {}, { results: "x" }, { results: [] }, [one()]]) assert.match(refused(raw).error, /Send \{ results/)
  assert.match(refused({ results: Array.from({ length: MAX_BATCH + 1 }, (_, i) => one({ file: `a/${i}.ts` })) }).error, new RegExp(`at most ${MAX_BATCH}`))
  assert.equal(parsed({ results: Array.from({ length: MAX_BATCH }, (_, i) => one({ file: `a/${i}.ts` })) }).results.length, MAX_BATCH)
  // Every fault is named up to a few, so one send can be put right in one go.
  assert.match(refused({ results: [one({ file: "" }), one({ status: "x" })] }).error, /result 1: file.*result 2: status/)
})

ok("the same rule on the same file twice in one batch: the newest is kept (the later one when they tie)", () => {
  const p = parsed({ results: [one({ status: "failed", note: "first", at: "2026-11-22T10:00:00Z" }), one({ status: "passed", at: "2026-11-22T09:00:00Z" }), one({ file: "b.ts" }), one({ file: "b.ts", status: "failed", note: "x" })] })
  assert.deepEqual(p.results.map((r) => [r.file, r.status]), [["app/page.tsx", "failed"], ["b.ts", "failed"]])
})

ok("an unknown source is kept as other; none sent is edit", () => {
  assert.equal(parsed({ results: [one()] }).source, "edit")
  assert.equal(parsed({ results: [one()], source: "send" }).source, "send")
  assert.equal(parsed({ results: [one()], source: "<script>" }).source, "other")
})

const G = (id: string, name: string, checks: string[], projectId: string | null = null): GuideKey => ({ id, name, projectId, checks: checks.map((c) => ({ id: c })) })

ok("a rule id maps back to its statement: the guide one of whose checks compiles to that id", () => {
  const guides = [G("g1", "US English", ["spelling", "dates"]), G("g2", "Phone screens", ["fits"])]
  assert.equal(guideForRule(ruleId("US English", "dates"), guides, null), "g1")
  assert.equal(guideForRule(ruleId("Phone screens", "fits"), guides, "p1"), "g2")
  // The plugin's built-in rules (secrets, size, impact) belong to no statement.
  assert.equal(guideForRule("secrets", guides, null), null)
  assert.equal(guideForRule("us-english", guides, null), null)
})

ok("a project's own guide wins over the one for all projects with the same name; another project's is never used", () => {
  const guides = [G("all", "US English", ["spelling"]), G("own", "US English", ["spelling"], "p1"), G("else", "US English", ["spelling"], "p2")]
  assert.equal(guideForRule("us-english-spelling", guides, "p1"), "own")
  assert.equal(guideForRule("us-english-spelling", guides, "p3"), "all")
  assert.equal(guideForRule("us-english-spelling", [G("else", "US English", ["spelling"], "p2")], "p1"), null)
})

ok("a renamed statement: capitals respelled is the same statement; a new name is a new one and nothing is guessed", () => {
  // The name is the key and is stored as first written; a save may spell its capitals differently.
  assert.equal(guideForRule(ruleId("us english", "spelling"), [G("g1", "US English", ["spelling"])], null), "g1")
  // Saved again under another name, it is another statement with other rule ids. A result sent under the old id
  // maps to the old statement while that is still on the list, and to nothing once it is not.
  assert.equal(guideForRule("us-english-spelling", [G("g1", "US English", ["spelling"]), G("g9", "American English", ["spelling"])], null), "g1")
  assert.equal(guideForRule("us-english-spelling", [G("g9", "American English", ["spelling"])], null), null)
  // A check whose id was changed: the old rule id is no longer any check's.
  assert.equal(guideForRule("us-english-spelling", [G("g1", "US English", ["words"])], null), null)
})

ok("two statements whose names and checks run together into one id: not guessed", () => {
  // "No mono" + "type-none" and "No mono type" + "none" both compile to no-mono-type-none.
  assert.equal(ruleId("No mono", "type-none"), ruleId("No mono type", "none"))
  assert.equal(guideForRule("no-mono-type-none", [G("a", "No mono", ["type-none"]), G("b", "No mono type", ["none"])], null), null)
})

ok("the table not being there yet is told apart from any other failure", () => {
  assert.equal(tableMissing({ code: "42P01", message: 'relation "gate_code_results" does not exist' }), true)
  assert.equal(tableMissing(new Error('relation "gate_code_result_events" does not exist')), true)
  assert.equal(tableMissing({ code: "42P01", message: 'relation "gate_guides" does not exist' }), false)
  assert.equal(tableMissing(new Error("connection refused")), false)
  assert.equal(tableMissing(null), false)
})

const T = (o: Partial<TallyRow>): TallyRow => ({ rule_id: "us-english-spelling", guide_id: "g1", status: "passed", n: 1, last_at: "2026-11-20T10:00:00.000Z", last_file: "a.tsx", ...o })

ok("counted rows become the ledger's records: each stands for n results, the newest named", () => {
  assert.deepEqual(toRecords([T({ n: 4 }), T({ status: "open", n: 2, guide_id: null, last_at: new Date("2026-11-21T10:00:00Z") })]), [
    { rule: "us-english-spelling", guide: "g1", file: "a.tsx", at: "2026-11-20T10:00:00.000Z", result: "passed", n: 4 },
    { rule: "us-english-spelling", guide: null, file: "a.tsx", at: "2026-11-21T10:00:00.000Z", result: "open", n: 2 },
  ])
  // A status the ledger has no word for is left out, never counted as something else.
  assert.deepEqual(toRecords([T({ status: "owed" }), T({ status: "strange" })]), [])
})

ok("a project's results by rule: where each file stands now, the statement's name, and the last failure", () => {
  const s = summarize([
    T({ n: 5 }), T({ status: "failed", n: 2, last_at: "2026-11-21T09:00:00.000Z", last_file: "b.tsx" }), T({ status: "owed", n: 1 }),
    T({ rule_id: "secrets", guide_id: null, n: 9 }),
  ], [{ id: "g1", name: "US English" }])
  assert.deepEqual(s, [
    { rule: "us-english-spelling", guideId: "g1", guide: "US English", files: 8, owed: 1, passed: 5, failed: 2, waived: 0, lastFailed: { at: "2026-11-21T09:00:00.000Z", file: "b.tsx" }, lastAt: "2026-11-21T09:00:00.000Z" },
    { rule: "secrets", guideId: null, guide: null, files: 9, owed: 0, passed: 9, failed: 0, waived: 0, lastFailed: null, lastAt: "2026-11-20T10:00:00.000Z" },
  ])
  assert.deepEqual(summarize([], []), [])
  // A statement no longer on the list keeps its id and has no name to show.
  assert.equal(summarize([T({ guide_id: "gone" })], [])[0].guide, null)
})

console.log(`\n${n} checks passed`)
