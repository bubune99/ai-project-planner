/* Run: npx -y tsx@4.23.15 lib/mcp/envelope-stamp.assert.ts */
import { mcpEnvelope } from "./envelope-stamp"
import { auditCompleteness } from "@/lib/validation/documentation-5wh"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.log(`FAIL ${what}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`) }
}

const given = mcpEnvelope({ type: "task", title: "Fix the claim message", summary: "When a claim has no project", rationale: "An agent could not pick up its answer", userId: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222" })!
eq(given.why.rationale, "An agent could not pick up its answer", "an agent's rationale is kept as given")
eq(given.what.title, "Fix the claim message", "the title")
eq(given.what.type, "task", "the type")
eq(given.what.summary, "When a claim has no project", "the summary")
eq(given.who.user_id, "11111111-1111-4111-8111-111111111111", "who made it")
eq(given.where.project_id, "22222222-2222-4222-8222-222222222222", "the project")

const none = mcpEnvelope({ type: "todo", title: "Call the bank", userId: "11111111-1111-4111-8111-111111111111" })!
eq(/^Auto-derived:/.test(none.why.rationale), true, "no rationale is recorded as auto-derived, never invented")
eq(none.what.summary, "Call the bank", "the summary falls back to the title")
eq(none.where?.project_id ?? null, null, "a personal todo has no project")

const blank = mcpEnvelope({ type: "idea", title: "x", rationale: "   ", userId: "11111111-1111-4111-8111-111111111111" })!
eq(/^Auto-derived:/.test(blank.why.rationale), true, "a blank rationale counts as none")

// F4: the audit lists the required fields as filled, not only the optional ones.
const audit = auditCompleteness(given)
eq(audit.filled.includes("why.rationale"), true, "the audit lists why.rationale as filled")
eq(audit.score, 50, "required fields alone still score 50")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
