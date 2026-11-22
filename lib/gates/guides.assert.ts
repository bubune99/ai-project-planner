import assert from "node:assert/strict"
import { changedInWords, clientDay, contentOf, historyOf, isDay, refusal, sameContent, storedContent, toRules, trialLabel, trialOf, validateGuide, versionToRestore, whoSaved, withTrial, type Guide, type GuideVersion } from "./guides"
import { DEFAULT_GUIDES } from "./default-guides"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const G = (o: Partial<Guide> = {}): Guide => ({ id: "1", kind: "stack", name: "Stripe", summary: "Payments", applies: { imports: ["stripe"] }, checks: [{ id: "test-run", say: "Run it in test mode" }], status: "active", source: "owner", basis: "Owner said so", ...o })

ok("a sound guide has no issues; a broken one says what is wrong", () => {
  assert.deepEqual(validateGuide(G()), [])
  const bad = (o: Partial<Guide>) => validateGuide(G(o)).map((i) => i.message).join(" / ")
  assert.match(bad({ name: " " }), /needs a name/)
  assert.match(bad({ basis: "" }), /where it comes from/)
  assert.match(bad({ applies: {} }), /which files/)
  assert.match(bad({ checks: [] }), /at least one check/)
  assert.match(bad({ checks: [{ id: "Bad Id", say: "x" }] }), /lowercase/)
  assert.match(bad({ checks: [{ id: "a1", say: "x" }, { id: "a1", say: "y" }] }), /share this id/)
  assert.match(bad({ checks: [{ id: "a1", say: "x", auto: "eval:rm" }] }), /auto must be/)
  assert.match(bad({ checks: [{ id: "a1", say: "x", auto: "forbids:(" }] }), /not a valid/)
})

ok("guides compile to one rule per check per file pattern; drafts hold nobody up", () => {
  const rules = toRules([G(), G({ id: "2", name: "No monospace type", kind: "statement", applies: { files: ["**/*.tsx", "**/*.css"] }, checks: [{ id: "none", say: "No monospace", auto: "forbids:font-mono" }] }), G({ id: "3", name: "Draft idea", status: "draft" })])
  assert.deepEqual(rules.map((r) => r.id), ["stripe-test-run", "no-monospace-type-none", "no-monospace-type-none"])
  assert.deepEqual(rules[0], { id: "stripe-test-run", match: "**/*.{ts,tsx,js,jsx,mjs}", from: "Stripe", imports: ["stripe"], manual: "Run it in test mode" })
  assert.equal(rules[1].auto, "forbids:font-mono")
  assert.equal(rules[1].say, "No monospace")
  assert.equal(rules[1].manual, undefined)
  assert.deepEqual(rules.slice(1).map((r) => r.match), ["**/*.tsx", "**/*.css"])
})

ok("the starting set is sound, names are unique, and it covers the stack the owner named", () => {
  for (const g of DEFAULT_GUIDES) assert.deepEqual(validateGuide({ ...g, id: "x" }), [], g.name)
  assert.equal(new Set(DEFAULT_GUIDES.map((g) => g.name)).size, DEFAULT_GUIDES.length)
  const stack = DEFAULT_GUIDES.filter((g) => g.kind === "stack").map((g) => g.name).join(" ")
  for (const tool of ["Next.js", "Vercel", "Cloudflare", "Stripe", "Hexclave", "React Flow", "shadcn", "Radix", "Zustand"]) assert.ok(stack.includes(tool), tool)
  assert.ok(DEFAULT_GUIDES.filter((g) => g.kind === "statement").every((g) => /Owner, 20\d\d/.test(g.basis)))
})

ok("the automatic statement patterns catch what they are meant to and leave good code alone", () => {
  const rule = (name: string) => new RegExp(toRules(DEFAULT_GUIDES.map((g, i) => ({ ...g, id: String(i) }))).find((r) => r.from === name)!.auto!.replace(/^forbids:/, ""))
  assert.ok(rule("No monospace type").test('<span className="font-mono text-xs">'))
  assert.ok(rule("No monospace type").test("font-family: ui-monospace, Menlo;"))
  assert.ok(!rule("No monospace type").test('<span className="font-medium">monthly</span>'))
  assert.ok(rule("No colored side-stripes").test('className="border-l-4 border-blue-500"'))
  assert.ok(rule("No colored side-stripes").test("border-left: 3px solid var(--accent);"))
  assert.ok(!rule("No colored side-stripes").test('className="border-l border-line"'))
  assert.ok(rule("US English").test("Choose your favourite colour"))
  assert.ok(!rule("US English").test("Choose your favorite color in the center"))
})

// ── Trial or permanent ──────────────────────────────────────────────────────

const S = (o: Partial<Guide> = {}) => G({ kind: "statement", name: "Phone screens", applies: { files: ["**/*.tsx"] }, ...o })

ok("a day is a real calendar date written YYYY-MM-DD", () => {
  assert.ok(isDay("2026-11-30"))
  assert.ok(isDay("2028-02-29"))
  for (const bad of ["2026-02-30", "2026-13-01", "11/30/2026", "2026-11-30T00:00:00Z", "", null, undefined, 20261130]) assert.ok(!isDay(bad), String(bad))
})

ok("a statement stored before trials existed is permanent, and nothing else about it changes", () => {
  const old = { kind: "statement", name: "US English", summary: "s", applies: { files: ["**/*.tsx"] }, checks: [{ id: "a1", say: "x" }], status: "active", source: "owner", basis: "Owner, 2026-11-13" }
  const read = storedContent(old)
  assert.equal(read.trialUntil, null)
  assert.deepEqual({ ...read, trialUntil: undefined }, { ...old, skill: undefined, trialUntil: undefined })
  assert.deepEqual(trialOf(read, "2026-11-22"), { state: "permanent" })
  // A stored value that is not a real day is read as permanent rather than shown as a date nobody set.
  assert.equal(storedContent({ ...old, trialUntil: "soon" }).trialUntil, null)
  assert.equal(storedContent({ ...old, trialUntil: "2026-12-01" }).trialUntil, "2026-12-01")
  // Unknown fields are not carried into what is written back.
  assert.equal("user_id" in storedContent({ ...old, user_id: "u" }), false)
})

ok("on trial until a date; due for review only once the date has passed", () => {
  const g = S({ trialUntil: "2026-11-30" })
  assert.deepEqual(trialOf(g, "2026-11-22"), { state: "trial", until: "2026-11-30", due: false })
  assert.deepEqual(trialOf(g, "2026-11-30"), { state: "trial", until: "2026-11-30", due: false })
  assert.deepEqual(trialOf(g, "2026-12-01"), { state: "trial", until: "2026-11-30", due: true })
  assert.equal(trialLabel(g, "2026-11-22"), "On trial until Nov 30, 2026")
  assert.equal(trialLabel(g, "2026-12-01"), "On trial: due for review since Nov 30, 2026")
  assert.equal(trialLabel(S(), "2026-11-22"), "Permanent")
})

ok("a trial statement is enforced exactly like a permanent one", () => {
  const strip = (g: Guide) => toRules([g])
  assert.deepEqual(strip(S({ trialUntil: "2026-11-30" })), strip(S()))
  assert.equal(strip(S({ trialUntil: "2026-11-30" })).length, 1)
  // Past its review date it is still enforced: only the owner ends a trial.
  assert.equal(toRules([S({ trialUntil: "2020-01-01" })]).length, 1)
})

ok("setting a trial needs a real date that is not already past; making permanent clears it", () => {
  const g = contentOf(S())
  const on = withTrial(g, "2026-11-30", "2026-11-22")
  assert.ok(!("error" in on) && on.trialUntil === "2026-11-30")
  assert.equal(g.trialUntil ?? null, null, "the original is not changed")
  const today = withTrial(g, "2026-11-22", "2026-11-22")
  assert.ok(!("error" in today))
  const past = withTrial(g, "2026-11-21", "2026-11-22")
  assert.ok("error" in past && /already passed/.test(past.error))
  const junk = withTrial(g, "next week", "2026-11-22")
  assert.ok("error" in junk && /date/.test(junk.error))
  const perm = withTrial({ ...g, trialUntil: "2026-11-30" }, null, "2026-11-22")
  assert.ok(!("error" in perm) && perm.trialUntil === null)
  const stack = withTrial(contentOf(G()), "2026-11-30", "2026-11-22")
  assert.ok("error" in stack && /statement/.test(stack.error))
})

ok("the browser's own day is used when it is within a day of the server's, otherwise the server's", () => {
  assert.equal(clientDay("2026-11-21", "2026-11-22"), "2026-11-21")
  assert.equal(clientDay("2026-11-23", "2026-11-22"), "2026-11-23")
  assert.equal(clientDay("2026-11-22", "2026-11-22"), "2026-11-22")
  assert.equal(clientDay("2026-11-10", "2026-11-22"), "2026-11-22")
  assert.equal(clientDay("2026-12-01", "2026-11-30"), "2026-12-01")
  assert.equal(clientDay("nope", "2026-11-22"), "2026-11-22")
  assert.equal(clientDay(undefined, "2026-11-22"), "2026-11-22")
})

// ── Who may do what ─────────────────────────────────────────────────────────

ok("an agent may save a statement and change its status as before; trial, permanent and restore are the owner's", () => {
  const agent = { kind: "agent", name: "worker-1" } as const
  const owner = { kind: "owner" } as const
  for (const c of ["saved", "status"] as const) { assert.equal(refusal(agent, c), null); assert.equal(refusal(owner, c), null) }
  for (const c of ["trial", "permanent", "restored"] as const) {
    assert.equal(refusal(owner, c), null)
    assert.match(refusal(agent, c)!, /owner/i)
  }
  assert.match(refusal({ kind: "agent", name: "" }, "restored")!, /owner/i)
  assert.equal(whoSaved(owner), "You")
  assert.equal(whoSaved(agent), "Agent worker-1")
  assert.equal(whoSaved({ kind: "agent", name: " " }), "An agent")
  assert.equal(whoSaved({ kind: "before" }), "Before history was kept")
})

// ── Versions ────────────────────────────────────────────────────────────────

ok("two saves with the same content are the same version; any difference is a new one", () => {
  const a = contentOf(S())
  assert.ok(sameContent(a, contentOf(S())))
  assert.ok(sameContent(a, { ...a, trialUntil: null }), "missing and permanent are the same")
  assert.ok(sameContent(a, { ...a, summary: ` ${a.summary} `, applies: { files: ["**/*.tsx"], imports: undefined } }))
  assert.ok(!sameContent(a, { ...a, summary: "Different" }))
  assert.ok(!sameContent(a, { ...a, checks: [{ id: "test-run", say: "Run it twice" }] }))
  assert.ok(!sameContent(a, { ...a, trialUntil: "2026-11-30" }))
})

ok("what changed between two versions is said in plain words", () => {
  const a = contentOf(S())
  assert.deepEqual(changedInWords(null, a), ["First version kept"])
  assert.deepEqual(changedInWords(a, a), ["Nothing changed"])
  assert.deepEqual(changedInWords(a, { ...a, summary: "New" }), ["Summary changed"])
  assert.deepEqual(changedInWords(a, { ...a, status: "draft" }), ["Set aside as a draft"])
  assert.deepEqual(changedInWords({ ...a, status: "draft" }, a), ["Made a rule"])
  assert.deepEqual(changedInWords(a, { ...a, trialUntil: "2026-11-30" }), ["Put on trial until Nov 30, 2026"])
  assert.deepEqual(changedInWords({ ...a, trialUntil: "2026-11-30" }, { ...a, trialUntil: "2026-12-15" }), ["Review date moved to Dec 15, 2026"])
  assert.deepEqual(changedInWords({ ...a, trialUntil: "2026-11-30" }, a), ["Made permanent"])
  assert.deepEqual(
    changedInWords(a, { ...a, checks: [{ id: "test-run", say: "Run it twice" }, { id: "new-one", say: "y" }], applies: { files: ["**/*.css"] }, basis: "Owner, 2026-11-20: changed", source: "research", skill: "stripe" }),
    ["Checks: 1 added, 1 reworded", "Files it applies to changed", "Where it comes from changed", "How-to skill changed"],
  )
  assert.deepEqual(changedInWords(a, { ...a, checks: [] }), ["Checks: 1 removed"])
})

const V = (version: number, o: Partial<GuideVersion> = {}, c: Partial<Guide> = {}): GuideVersion => ({ version, at: `2026-11-${10 + version}T12:00:00.000Z`, by: { kind: "owner" }, change: "saved", content: contentOf(S(c)), ...o })

ok("history lists every version newest first, with who, when and what changed", () => {
  assert.deepEqual(historyOf([]), [])
  const h = historyOf([
    V(2, { by: { kind: "agent", name: "worker-1" } }, { summary: "Second" }),
    V(1, { by: { kind: "before" }, change: "before" }),
    V(3, { change: "trial" }, { summary: "Second", trialUntil: "2026-11-30" }),
    V(4, { change: "restored", restoredFrom: 1 }),
  ])
  assert.deepEqual(h.map((e) => e.version), [4, 3, 2, 1])
  assert.deepEqual(h.map((e) => e.who), ["You", "You", "Agent worker-1", "Before history was kept"])
  assert.deepEqual(h.map((e) => e.changes), [
    ["Restored version 1", "Summary changed", "Made permanent"],
    ["Put on trial until Nov 30, 2026"],
    ["Summary changed"],
    ["As it stood before history was kept"],
  ])
  assert.equal(h[0].at, "2026-11-14T12:00:00.000Z")
  assert.deepEqual(h.map((e) => e.current), [true, false, false, false])
})

ok("a version can be restored by number; a missing one cannot; restoring the current one is refused", () => {
  const vs = [V(1), V(2, {}, { summary: "Second" }), V(3, {}, { summary: "Third" })]
  const r = versionToRestore(vs, 1)
  assert.ok(!("error" in r) && r.content.summary === "Payments")
  assert.notEqual((r as { content: unknown }).content, vs[0].content, "a copy, not the stored object")
  const none = versionToRestore(vs, 9)
  assert.ok("error" in none && /no version 9/i.test(none.error))
  const cur = versionToRestore(vs, 3)
  assert.ok("error" in cur && /already/.test(cur.error))
  // A version saved before trials existed restores as permanent.
  const old = versionToRestore([{ ...V(1), content: { ...contentOf(S()), trialUntil: undefined } as unknown as GuideVersion["content"] }, V(2, {}, { trialUntil: "2026-11-30" })], 1)
  assert.ok(!("error" in old) && old.content.trialUntil === null)
})

console.log(`\n${n} checks passed`)
