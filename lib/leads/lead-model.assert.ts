// npx -y tsx@4.23.15 lib/leads/lead-model.assert.ts
import assert from "node:assert/strict"
import { parseLead, canWriteLeads, canReadLeads, isLeadStatus, LEAD_LIMITS } from "./lead-model"

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${n} - ${name}`) }
const good = { name: " ZZ SAMPLE Ada ", email: " Ada@Example.COM ", message: "Hello", source: "farcncpt.com contact form" }

t("a note is cleaned: trimmed, email lower-cased, blanks become null", () => {
  const r = parseLead({ ...good, company: "  ", topic: "work", ref: "abc" })
  assert.ok(r.ok)
  assert.deepEqual(r.ok && r.value, { name: "ZZ SAMPLE Ada", email: "ada@example.com", company: null, topic: "work", message: "Hello", source: "farcncpt.com contact form", ref: "abc" })
})
t("required fields", () => {
  for (const k of ["name", "email", "message", "source"] as const) {
    const r = parseLead({ ...good, [k]: "" })
    assert.equal(r.ok, false, k)
    assert.equal(!r.ok && r.error, `${k} is required`)
  }
})
t("a bad email, a long message, a wrong type, an unknown field are refused", () => {
  assert.equal(parseLead({ ...good, email: "not-an-email" }).ok, false)
  assert.equal(parseLead({ ...good, message: "x".repeat(LEAD_LIMITS.message + 1) }).ok, false)
  assert.equal(parseLead({ ...good, message: 5 }).ok, false)
  const u = parseLead({ ...good, userId: "x" })
  assert.equal(!u.ok && u.error, "not a lead field: userId")
  assert.equal(parseLead(null).ok, false)
  assert.equal(parseLead([good]).ok, false)
})
t("keys: a leads-only key writes but cannot read; a session does both", () => {
  const site = { authType: "api-key", scopes: ["leads:write"] }
  assert.equal(canWriteLeads(site), true)
  assert.equal(canReadLeads(site), false)
  assert.equal(canWriteLeads({ authType: "api-key", scopes: ["read"] }), false)
  assert.equal(canWriteLeads({ authType: "api-key", scopes: ["read", "write"] }), true)
  assert.equal(canReadLeads({ authType: "session" }), true)
  assert.equal(canWriteLeads({ authType: "api-key" }), false, "no scopes: nothing")
})
t("statuses", () => {
  assert.equal(isLeadStatus("replied"), true)
  assert.equal(isLeadStatus("spam"), false)
})
console.log(`lead-model: ${n} checks passed`)
