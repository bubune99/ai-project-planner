/**
 * Assertions for lib/readiness/model.ts. Run with a tsx that is not 4.21.0:
 *   npx -y tsx@4.23.15 lib/readiness/model.assert.ts
 */

import { ITEMS, OPEN_ITEMS, applies, staleAfter, effectiveState, authorize, computeReadiness, planSync, readinessMarkdown, itemById, type Profile, type ValidationRow } from "./model"

let pass = 0
let fail = 0
function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) pass++
  else { fail++; console.error(`FAIL ${what}\n  got:  ${a}\n  want: ${b}`) }
}

const NOW = "2026-10-04T12:00:00.000Z"
const xplor: Profile = { launchType: "extension", regions: ["US", "US-CA"], traits: ["ai", "accounts", "browser-extension", "mcp", "payments"] }
const item = (id: string) => itemById(id)!

// catalog integrity
eq(ITEMS.length >= 90, true, "catalog loaded from catalog.json")
eq(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length, "item ids unique")
eq(OPEN_ITEMS.flatMap((o) => o.blocks ?? []).filter((b) => !itemById(b)), [], "open items block real items")

// applicability
eq(applies(item("S-XPLOR-IP-ORIGIN"), xplor), true, "extension-only item applies to an extension")
eq(applies(item("ST-TAX-REGISTER"), xplor), false, "store item doesn't apply to an extension")
eq(applies(item("IO-CHILDREN"), xplor), false, "minors item needs the minors trait")
eq(applies(item("IO-CHILDREN"), { ...xplor, traits: [...xplor.traits, "minors"] }), true, "…and applies with it")

// staleness
eq(staleAfter(item("L-PRIVACY-POLICY"), "2026-01-01T00:00:00Z")?.slice(0, 10), "2026-07-01", "legal re-check after 6 months")
eq(staleAfter(item("C1-ROUTE-AUTHZ"), "2020-01-01T00:00:00Z"), null, "code never stales on time alone")
eq(staleAfter(item("R-RESTORE"), "2026-01-01T00:00:00Z")?.slice(0, 10), "2026-04-03", "quarterly cadence")
eq(effectiveState(item("L-PRIVACY-POLICY"), { itemId: "L-PRIVACY-POLICY", state: "passed", decidedAt: "2025-01-01T00:00:00Z" }, NOW), "stale", "old legal pass reads stale")
eq(effectiveState(item("L-PRIVACY-POLICY"), undefined, NOW), "unvalidated", "no row = unvalidated")

// who may set what
eq(authorize(item("C3-SECRETS"), "passed", "agent", { evidence: [{ kind: "check", summary: "clean" }] }), { ok: true, state: "passed" }, "agent passes code with machine evidence")
eq(authorize(item("C3-SECRETS"), "passed", "agent", { evidence: [{ kind: "link", summary: "trust me" }] }).ok && (authorize(item("C3-SECRETS"), "passed", "agent", { evidence: [{ kind: "link", summary: "x" }] }) as { state: string }).state, "proposed", "agent code pass without machine evidence → proposed")
eq((authorize(item("L-PRIVACY-POLICY"), "passed", "agent", { evidence: [{ kind: "check", summary: "page exists" }] }) as { state: string }).state, "proposed", "agent can't pass legal even with a check")
eq(authorize(item("L-PRIVACY-POLICY"), "failed", "agent", {}), { ok: true, state: "failed" }, "agent can record a failure")
eq(authorize(item("L-PRIVACY-POLICY"), "waived", "agent", { reason: "n/a" }).ok, false, "agent can't waive")
eq(authorize(item("L-PRIVACY-POLICY"), "waived", "user", {}).ok, false, "waiver needs a reason")
eq(authorize(item("L-PRIVACY-POLICY"), "passed", "user", {}), { ok: true, state: "passed" }, "owner passes legal")
eq(authorize(item("L-PRIVACY-POLICY"), "stale", "user", {}).ok, false, "stale is computed, not set")

// health
const empty = computeReadiness(xplor, [], NOW)
eq([empty.phase, empty.currentGate, empty.health], [-1, 0, "amber"], "nothing done: phase none, gate 0, amber")
const gate0 = empty.validations.filter((v) => v.item.gate === 0).map((v): ValidationRow => ({ itemId: v.item.id, state: "passed", decidedAt: "2026-10-01T00:00:00Z", actorKind: "user", decidedBy: "Bubune" }))
const g0done = computeReadiness(xplor, gate0, NOW)
eq([g0done.phase, g0done.currentGate], [0, 1], "gate 0 all passed → phase 0, working on gate 1")
const withFail = computeReadiness(xplor, [...gate0, { itemId: "C6-ERROR-LEAK", state: "failed", reason: "6 leaks" }], NOW)
eq(withFail.health, "red", "a failed P0 anywhere is red")
const waived = computeReadiness(xplor, [...gate0.slice(1), { itemId: gate0[0].itemId, state: "waived", reason: "accepted", decidedAt: "2026-10-01T00:00:00Z" }], NOW)
eq(waived.phase, 0, "waived counts toward the gate")
eq(Object.keys(g0done.gates[0].byDomain).length > 0, true, "per-domain completion is reported")

// sync from the extension
const synced = planSync([
  { itemId: "C3-SECRETS", status: "pass", summary: "No secrets" },
  { itemId: "L-PRIVACY-POLICY", status: "pass", summary: "Policy at /privacy" },
  { itemId: "C6-ERROR-LEAK", status: "fail", summary: "6 leaks", findings: [{ path: "web/a.ts", line: 13, message: "m" }] },
  { itemId: "GPC-NOPE", status: "pass", summary: "unknown item" },
  { itemId: "C11-SSRF", status: "n/a", summary: "nothing" },
], [], NOW)
eq(synced.map((s) => [s.itemId, s.state]), [["C3-SECRETS", "passed"], ["L-PRIVACY-POLICY", "proposed"], ["C6-ERROR-LEAK", "failed"]], "sync: code passes, legal proposed, fail failed, unknown/n-a skipped")
eq(synced[2].evidence.ref, "web/a.ts:13", "sync evidence points at the first finding")
const ownerRows: ValidationRow[] = [{ itemId: "L-PRIVACY-POLICY", state: "passed", actorKind: "user", decidedAt: NOW }, { itemId: "C6-ERROR-LEAK", state: "waived", actorKind: "user", reason: "admin only" }]
eq(planSync([{ itemId: "L-PRIVACY-POLICY", status: "pass", summary: "x" }, { itemId: "C6-ERROR-LEAK", status: "fail", summary: "y" }], ownerRows, NOW), [], "sync never overrides an owner pass, nor reopens a waiver")
eq(planSync([{ itemId: "L-PRIVACY-POLICY", status: "fail", summary: "page gone" }], ownerRows, NOW).map((s) => s.state), ["failed"], "…but a failing check reopens an owner pass")

eq(planSync([{ itemId: "C11-SSRF", status: "n/a", summary: "gone" }], [{ itemId: "C11-SSRF", state: "failed", actorKind: "agent" }], NOW).map((s) => s.state), ["unvalidated"], "n/a clears a machine-set result")
eq(planSync([{ itemId: "C11-SSRF", status: "n/a", summary: "gone" }], [{ itemId: "C11-SSRF", state: "failed", actorKind: "user" }], NOW), [], "…but never an owner's decision")

// export
const md = readinessMarkdown("FAR Xplor", withFail, "2026-10-04")
eq([md.includes("**Health: RED**"), md.includes("## Gate 0"), md.includes("Not legal or tax advice"), md.includes("Verify before relying")], [true, true, true, true], "report has health, gates, disclaimer, open items")

eq(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(md), false, "report marks states with words, not emoji")
eq([md.includes("- [Failed] **C6-ERROR-LEAK**"), md.includes("[Not checked]")], [true, true], "report names each item's state")

console.log(`readiness model: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
