/**
 * Checks for lib/readiness/input.ts. Run:
 *   npx -y tsx@4.23.15 lib/readiness/input.assert.ts
 */
import assert from "node:assert/strict"
import { cleanEvidence, cleanSyncResults, isOverride, validateProfileInput, whoIsActing, MAX_EVIDENCE, MAX_SYNC_RESULTS } from "./input"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }

ok("a sound profile is read back, with US as the region when none is given", () => {
  assert.deepEqual(validateProfileInput({ launchType: "extension", traits: ["ai", "ai", "payments"], domain: " Example.COM ", siteUrl: "https://example.com" }), {
    ok: true,
    value: { launchType: "extension", regions: ["US"], traits: ["ai", "payments"], domain: "example.com", siteUrl: "https://example.com/" },
  })
})

ok("a profile is refused for a wrong type, an unknown trait, a bad domain or a site that is not https", () => {
  assert.equal(validateProfileInput(null).ok, false)
  assert.equal(validateProfileInput([]).ok, false)
  assert.equal(validateProfileInput({ launchType: "rocket" }).ok, false)
  assert.deepEqual(validateProfileInput({ launchType: "store", traits: ["magic"] }), { ok: false, error: "unknown trait(s): magic" })
  assert.equal(validateProfileInput({ launchType: "store", traits: "ai" }).ok, false)
  assert.equal(validateProfileInput({ launchType: "store", regions: [1] }).ok, false)
  assert.equal(validateProfileInput({ launchType: "store", domain: "not a domain" }).ok, false)
  assert.deepEqual(validateProfileInput({ launchType: "store", siteUrl: "http://example.com" }), { ok: false, error: "siteUrl must be https" })
  assert.deepEqual(validateProfileInput({ launchType: "store", siteUrl: "nope" }), { ok: false, error: "siteUrl must be a URL" })
})

ok("evidence keeps only its known fields, cut to length, and at most the limit", () => {
  assert.deepEqual(cleanEvidence(undefined), [])
  assert.deepEqual(cleanEvidence([{ kind: "check", summary: "clean", ref: "a.ts:1", evil: true }]), [{ kind: "check", summary: "clean", ref: "a.ts:1" }])
  const many = cleanEvidence(Array.from({ length: MAX_EVIDENCE + 5 }, () => ({ kind: "note", summary: "x".repeat(5000) })))
  assert.ok(Array.isArray(many))
  assert.equal((many as unknown[]).length, MAX_EVIDENCE)
  assert.equal((many as { summary: string }[])[0].summary.length, 1000)
})

ok("evidence is refused when it is not a list, has an unknown kind or no summary", () => {
  assert.equal(typeof cleanEvidence("x"), "string")
  assert.equal(typeof cleanEvidence(["x"]), "string")
  assert.equal(typeof cleanEvidence([{ kind: "vibes", summary: "x" }]), "string")
  assert.equal(typeof cleanEvidence([{ kind: "check", summary: "  " }]), "string")
})

ok("scanner results keep only well-formed rows, with short summaries and at most five findings each", () => {
  assert.equal(cleanSyncResults("x"), null)
  const out = cleanSyncResults([
    { itemId: "C3-SECRETS", status: "pass", summary: "s".repeat(900), findings: Array.from({ length: 9 }, (_, i) => ({ path: "a.ts", line: i, message: "m" })) },
    { itemId: "C6-ERROR-LEAK", status: "exploded", summary: "x" },
    { itemId: 7, status: "pass", summary: "x" },
    { itemId: "C11-SSRF", status: "n/a" },
    { itemId: "C11-SSRF", status: "fail", summary: "x", findings: [{ path: 1, line: "a" }, "junk"] },
    null,
  ])!
  assert.deepEqual(out.map((r) => [r.itemId, r.status]), [["C3-SECRETS", "pass"], ["C11-SSRF", "fail"]])
  assert.equal(out[0].summary.length, 500)
  assert.equal(out[0].findings.length, 5)
  assert.deepEqual(out[1].findings, [])
  assert.equal(cleanSyncResults(Array.from({ length: MAX_SYNC_RESULTS + 50 }, () => ({ itemId: "C3-SECRETS", status: "pass", summary: "x" })))!.length, MAX_SYNC_RESULTS)
})

ok("an owner passing something whose last machine check failed is an override, and nothing else is", () => {
  const failedCheck = { state: "failed", evidence: [{ kind: "note" as const, summary: "n" }, { kind: "check" as const, summary: "6 leaks" }] }
  assert.equal(isOverride("user", "passed", failedCheck), true)
  assert.equal(isOverride("agent", "passed", failedCheck), false)
  assert.equal(isOverride("user", "waived", failedCheck), false)
  assert.equal(isOverride("user", "passed", { state: "failed", evidence: [{ kind: "note", summary: "n" }] }), false)
  assert.equal(isOverride("user", "passed", { state: "proposed", evidence: failedCheck.evidence }), false)
  assert.equal(isOverride("user", "passed", undefined), false)
})

ok("the owner signed in is the owner; a key, an agent in the owner's tab and a collaborator are not", () => {
  const session = { authType: "session" as const, userId: "u1" }
  assert.deepEqual(whoIsActing(session, { isOwner: true, saysAgent: false }), { role: "owner", actor: { id: "u1", kind: "user", source: "manual" } })
  assert.deepEqual(whoIsActing(session, { isOwner: true, saysAgent: true }), { role: "agent", actor: { id: "agent-in-session:u1", kind: "agent", source: "api" } })
  assert.deepEqual(whoIsActing(session, { isOwner: false, saysAgent: false }), { role: "collaborator", actor: { id: "collaborator:u1", kind: "agent", source: "manual" } })
  assert.deepEqual(whoIsActing({ authType: "api-key", userId: "u1", apiKeyId: "k9" }, { isOwner: true, saysAgent: false, source: "extension" }), { role: "agent", actor: { id: "api-key:k9", kind: "agent", source: "extension" } })
  assert.equal(whoIsActing({ authType: "api-key", userId: "u1" }, { isOwner: true, saysAgent: false }).actor.id, "api-key:unknown")
})

console.log(`readiness input: ${n} passed`)
