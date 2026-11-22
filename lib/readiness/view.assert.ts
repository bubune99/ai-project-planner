/**
 * Checks for lib/readiness/view.ts. Run:
 *   npx -y tsx@4.23.15 lib/readiness/view.assert.ts
 */
import assert from "node:assert/strict"
import { LAUNCH_TYPES, STATES, TRAITS, computeReadiness, readinessMarkdown, type Profile, type ValidationRow } from "./model"
import { validateProfileInput } from "./input"
import {
  ADVICE_LINE, DOMAIN_WORD, LAUNCH_TYPE_WORD, PROOF_WORD, STATE_TONE, STATE_WORD, TRAIT_WORD,
  before, countsLine, gateLine, groupItems, healthWords, historyLine, needsDoing, noticeLine, ownerActions, profileBody, todoCount, undoOf,
} from "./view"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

const NOW = "2026-11-22T12:00:00.000Z"
const profile: Profile = { launchType: "extension", regions: ["US", "US-CA"], traits: ["ai", "accounts", "browser-extension", "mcp", "payments"] }
const rows: ValidationRow[] = [
  { itemId: "C3-SECRETS", state: "passed", actorKind: "agent", decidedAt: "2026-11-20T00:00:00Z" },
  { itemId: "L-PRIVACY-POLICY", state: "proposed", actorKind: "agent", decidedAt: "2026-11-20T00:00:00Z" },
  { itemId: "C6-ERROR-LEAK", state: "failed", actorKind: "agent", decidedAt: "2026-11-20T00:00:00Z" },
  { itemId: "L-AGE", state: "passed", actorKind: "user", decidedAt: "2025-01-01T00:00:00Z" }, // legal, older than 6 months: due for re-check
]
const r = computeReadiness(profile, rows, NOW)
const fresh = computeReadiness(profile, [], NOW)

ok("every launch type, trait and state the rules know has words, and nothing else does", () => {
  assert.deepEqual(Object.keys(LAUNCH_TYPE_WORD).sort(), [...LAUNCH_TYPES].sort())
  assert.deepEqual(Object.keys(TRAIT_WORD).sort(), [...TRAITS].sort())
  assert.deepEqual(Object.keys(STATE_WORD).sort(), [...STATES].sort())
  assert.deepEqual(Object.keys(STATE_TONE).sort(), [...STATES].sort())
  assert.deepEqual(Object.keys(DOMAIN_WORD).sort(), ["business", "code", "legal", "market"])
  assert.deepEqual(Object.keys(PROOF_WORD).sort(), ["automated", "evidence", "signoff"])
  for (const w of [...Object.values(LAUNCH_TYPE_WORD), ...Object.values(TRAIT_WORD), ...Object.values(STATE_WORD)]) assert.ok(w.trim().length > 1)
})

ok("the states read as words", () => {
  assert.equal(STATE_WORD.unvalidated, "Not started")
  assert.equal(STATE_WORD.proposed, "Proposed")
  assert.equal(STATE_WORD.passed, "Passed")
  assert.equal(STATE_WORD.failed, "Failed")
  assert.equal(STATE_WORD.waived, "Waived")
  assert.equal(STATE_WORD.stale, "Due for re-check")
})

ok("what still needs doing is everything not passed and not waived", () => {
  assert.deepEqual(STATES.filter(needsDoing), ["unvalidated", "proposed", "failed", "stale"])
  assert.equal(todoCount(r.validations), r.validations.length - 1) // only C3-SECRETS is done; L-AGE is due again
  assert.equal(todoCount(fresh.validations), fresh.validations.length)
})

ok("items group by gate, then by domain in a fixed order, keeping every item exactly once", () => {
  const groups = groupItems(r.validations, r.gates, "all")
  assert.deepEqual(groups.map((g) => g.gate.gate), r.gates.filter((g) => g.total).map((g) => g.gate))
  const ids = groups.flatMap((g) => g.domains.flatMap((d) => d.items.map((v) => v.item.id)))
  assert.deepEqual([...ids].sort(), r.validations.map((v) => v.item.id).sort())
  for (const g of groups) {
    assert.equal(g.shown, g.gate.total)
    const order = g.domains.map((d) => ["code", "market", "business", "legal"].indexOf(d.domain))
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
    for (const d of g.domains) {
      assert.ok(d.items.length > 0)
      assert.ok(d.items.every((v) => v.item.gate === g.gate.gate && v.item.domain === d.domain))
      assert.equal(d.total, g.gate.byDomain[d.domain].total)
      assert.equal(d.done, g.gate.byDomain[d.domain].passed)
    }
  }
})

ok("the still-to-do view leaves out passed and waived items but keeps every gate and its counts", () => {
  const all = groupItems(r.validations, r.gates, "all")
  const todo = groupItems(r.validations, r.gates, "todo")
  assert.deepEqual(todo.map((g) => g.gate), all.map((g) => g.gate))
  const ids = todo.flatMap((g) => g.domains.flatMap((d) => d.items.map((v) => v.item.id)))
  assert.equal(ids.includes("C3-SECRETS"), false)
  assert.equal(ids.includes("C6-ERROR-LEAK"), true)
  assert.equal(ids.includes("L-AGE"), true)
  assert.equal(ids.length, todoCount(r.validations))
  // A gate with nothing left shows no items and says so through shown = 0.
  const one = r.validations.filter((v) => v.item.id === "C3-SECRETS")
  const g = groupItems(one, r.gates.filter((x) => x.gate === one[0].item.gate), "todo")
  assert.equal(g.length, 1)
  assert.equal(g[0].shown, 0)
  assert.deepEqual(g[0].domains, [])
})

ok("a gate's counts are said in words", () => {
  assert.equal(gateLine({ gate: 0, name: "Foundation", total: 12, passed: 3, failed: 1, open: 8, byDomain: {} }), "3 of 12 passed or waived · 1 failed or due for re-check · 8 still open")
  assert.equal(gateLine({ gate: 0, name: "Foundation", total: 2, passed: 2, failed: 0, open: 0, byDomain: {} }), "2 of 2 passed or waived")
  assert.equal(countsLine(r.counts), `Passed 1 · Failed 1 · Due for re-check 1 · Proposed 1 · Not started ${r.counts.unvalidated} · Waived 0`)
  assert.equal(countsLine(null), "Passed – · Failed – · Due for re-check – · Proposed – · Not started – · Waived –")
})

ok("health is said in words, with the gate the work is at", () => {
  const red = healthWords(r)
  assert.equal(red.tone, "bad")
  assert.match(red.head, /^Blocked/)
  assert.equal(red.gate, `Gate ${r.currentGate} · ${r.gates.find((g) => g.gate === r.currentGate)!.name}`)
  assert.equal(red.cleared, "No gate fully passed yet")
  const amber = healthWords(fresh)
  assert.equal(amber.tone, "warn")
  assert.match(amber.head, /^In progress/)
  const green = healthWords({ health: "green", currentGate: null, phase: 5, gates: r.gates })
  assert.equal(green.tone, "ok")
  assert.match(green.head, /^Clear/)
  assert.equal(green.gate, "All gates clear")
  assert.equal(green.cleared, `Last gate fully passed: Gate 5 · ${r.gates[5].name}`)
})

ok("the owner is offered every decision except the one already made", () => {
  assert.deepEqual(ownerActions("unvalidated"), ["passed", "failed", "waived"])
  assert.deepEqual(ownerActions("proposed"), ["passed", "failed", "waived"])
  assert.deepEqual(ownerActions("stale"), ["passed", "failed", "waived"])
  assert.deepEqual(ownerActions("passed"), ["failed", "waived"])
  assert.deepEqual(ownerActions("failed"), ["passed", "waived"])
  assert.deepEqual(ownerActions("waived"), ["passed", "failed"])
})

ok("under Still to do a failed item stays and a waived item leaves; both show under All", () => {
  const some = computeReadiness(profile, [
    { itemId: "C6-ERROR-LEAK", state: "failed", actorKind: "user", decidedAt: "2026-11-20T00:00:00Z" },
    { itemId: "C3-SECRETS", state: "waived", reason: "why", actorKind: "user", decidedAt: "2026-11-20T00:00:00Z" },
  ], NOW)
  const idsOf = (show: "todo" | "all") => groupItems(some.validations, some.gates, show).flatMap((g) => g.domains.flatMap((d) => d.items.map((v) => v.item.id)))
  assert.equal(idsOf("todo").includes("C6-ERROR-LEAK"), true)
  assert.equal(idsOf("todo").includes("C3-SECRETS"), false)
  assert.equal(idsOf("all").includes("C6-ERROR-LEAK"), true)
  assert.equal(idsOf("all").includes("C3-SECRETS"), true)
})

ok("what an item was before a decision is what Undo sends: a due re-check goes back as its stored pass, the rest as they were", () => {
  assert.deepEqual(before("unvalidated", null), { state: "unvalidated", reason: null })
  assert.deepEqual(before("proposed", "Policy at /privacy"), { state: "proposed", reason: "Policy at /privacy" })
  assert.deepEqual(before("waived", "Not selling in the EU"), { state: "waived", reason: "Not selling in the EU" })
  assert.deepEqual(before("stale", "Due for re-check since 2025-07-01."), { state: "passed", reason: null })
})

ok("the notice after a decision names the item and what was done", () => {
  assert.equal(noticeLine("Secrets are not in the code", "passed", false), "Marked \u201cSecrets are not in the code\u201d passed.")
  assert.equal(noticeLine("Secrets are not in the code", "waived", false), "Marked \u201cSecrets are not in the code\u201d waived.")
  assert.equal(noticeLine("Secrets are not in the code", "unvalidated", true), "Put \u201cSecrets are not in the code\u201d back to not started.")
  assert.equal(noticeLine("Secrets are not in the code", "proposed", true), "Put \u201cSecrets are not in the code\u201d back to proposed.")
})

const ev = (from: string | null, to: string, kind: "user" | "agent", reason: string | null = null) =>
  ({ item_id: "X", from_state: from, to_state: to, reason, actor: kind === "user" ? "u1" : "api-key:k1", actor_kind: kind, source: kind === "user" ? "manual" : "api", override: false, created_at: "2026-11-22T10:00:00Z" })

ok("the owner's last decision can be put back to a state the route can set, with that state's own reason", () => {
  assert.deepEqual(undoOf([ev("proposed", "passed", "user"), ev(null, "proposed", "agent", "Policy at /privacy")]), { ok: true, state: "proposed", reason: "Policy at /privacy" })
  assert.deepEqual(undoOf([ev("waived", "failed", "user"), ev("proposed", "waived", "user", "Not selling in the EU")]), { ok: true, state: "waived", reason: "Not selling in the EU" })
  assert.deepEqual(undoOf([ev("failed", "passed", "user")]), { ok: true, state: "failed", reason: null })
  // Not started before the owner's decision: it goes back to not started (the stored state the model calls unvalidated).
  assert.deepEqual(undoOf([ev(null, "passed", "user")]), { ok: true, state: "unvalidated", reason: null })
  assert.deepEqual(undoOf([ev("unvalidated", "waived", "user", "why")]), { ok: true, state: "unvalidated", reason: null })
})

ok("it cannot be put back when nothing was decided, an agent made the last change, or a waiver's reason is not known", () => {
  assert.equal(undoOf([]).ok, false)
  assert.equal(undoOf([ev("proposed", "passed", "agent")]).ok, false)
  assert.equal(undoOf([ev("waived", "passed", "user")]).ok, false)
  assert.equal(undoOf([ev("waived", "passed", "user"), ev("failed", "proposed", "agent", "other")]).ok, false)
})

ok("a history row says who, and from what to what, without printing an id", () => {
  assert.deepEqual(historyLine(ev("proposed", "passed", "user")), { who: "The owner", change: "Proposed to Passed", override: false })
  assert.deepEqual(historyLine(ev(null, "proposed", "agent")), { who: "An agent (API key)", change: "Not started to Proposed", override: false })
  assert.equal(historyLine({ ...ev("passed", "failed", "agent"), actor: "u1", source: "extension" }).who, "A scanner upload")
  assert.equal(historyLine({ ...ev("passed", "failed", "agent"), actor: "agent-in-session:u1" }).who, "An agent in the owner's tab")
  assert.equal(historyLine({ ...ev("passed", "failed", "agent"), actor: "collaborator:u2", source: "manual" }).who, "A collaborator")
  assert.equal(historyLine({ ...ev("passed", "failed", "agent"), actor: "comprehension", source: "mcp" }).who, "An agent")
  assert.equal(historyLine({ ...ev("failed", "passed", "user"), override: true }).override, true)
  assert.equal(historyLine({ ...ev("failed", "mystery", "user") }).change, "Failed to mystery")
})

ok("the form's fields become a body the profile rule accepts", () => {
  const body = profileBody({ launchType: "store", traits: ["payments", "physical-goods"], regions: " US, US-CA ,, US ", domain: " Example.com ", siteUrl: " https://example.com " })
  assert.deepEqual(body, { launchType: "store", traits: ["payments", "physical-goods"], regions: ["US", "US-CA"], domain: "Example.com", siteUrl: "https://example.com" })
  assert.equal(validateProfileInput(body).ok, true)
  const bare = profileBody({ launchType: "product", traits: [], regions: "", domain: "", siteUrl: "" })
  assert.deepEqual(bare, { launchType: "product", traits: [], regions: [], domain: null, siteUrl: null })
  assert.deepEqual(validateProfileInput(bare), { ok: true, value: { launchType: "product", regions: ["US"], traits: [], domain: null, siteUrl: null } })
})

ok("the advice line is the export's own line, word for word", () => {
  assert.ok(readinessMarkdown("Sample", r, "2026-11-22").split("\n").includes(`> ${ADVICE_LINE}`))
})

console.log(`readiness view: ${n} passed`)
