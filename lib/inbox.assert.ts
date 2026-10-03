/*
 * Assertions for lib/inbox.ts. Run: npx -y tsx@4.23.15 lib/inbox.assert.ts
 * (not the pinned tsx 4.21.0 — see CLAUDE.md).
 */
import { buildQuestionInput, toInboxItem, resolveAnswer, statusAfterAnswer, MAX_OPTIONS } from "./inbox"

let pass = 0, fail = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.error(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`) }
}

// ── buildQuestionInput ──────────────────────────────────────────────
const ok = buildQuestionInput({ question: "  Ship it?  ", options: [" Yes ", "No", "", "yes", "Later"], projectId: "p1" })
eq("valid: ok", ok.ok, true)
if (ok.ok) {
  eq("question trimmed", ok.value.question, "Ship it?")
  eq("options trimmed, blanks dropped, case-insensitive dedupe keeps first", ok.value.input.options, ["Yes", "No", "Later"])
  eq("kind stamped", ok.value.input.kind, "question")
  eq("projectId carried", ok.value.input.projectId, "p1")
  eq("absent context is null", ok.value.input.context, null)
}
eq("no options is allowed (free-text question)", buildQuestionInput({ question: "What name?" }).ok, true)
eq("exactly one option rejected", buildQuestionInput({ question: "Q", options: ["Only"] }).ok, false)
eq("one option after dedupe rejected", buildQuestionInput({ question: "Q", options: ["A", "a"] }).ok, false)
eq("too many options rejected", buildQuestionInput({ question: "Q", options: Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `o${i}`) }).ok, false)
eq("max options allowed", buildQuestionInput({ question: "Q", options: Array.from({ length: MAX_OPTIONS }, (_, i) => `o${i}`) }).ok, true)
eq("empty question rejected", buildQuestionInput({ question: "   " }).ok, false)
eq("over-long option rejected", buildQuestionInput({ question: "Q", options: ["a", "x".repeat(121)] }).ok, false)
eq("over-long question rejected", buildQuestionInput({ question: "x".repeat(2001) }).ok, false)
eq("non-string options rejected", buildQuestionInput({ question: "Q", options: [1, 2] as unknown as string[] }).ok, false)

// ── toInboxItem ─────────────────────────────────────────────────────
const qRow = {
  id: "j1", title: "Ship it?", unlock_prompt: "Ship it?", created_by: "u1", assigned_to: "claude-code",
  created_at: "2026-10-03T10:00:00Z",
  input: { kind: "question", options: ["Yes", "No"], context: "Staging verified", projectId: "p1", stepId: null },
}
const names = { p1: "Mission Control" }
eq("question row → card", toInboxItem(qRow, names), {
  id: "j1", kind: "question", question: "Ship it?", options: ["Yes", "No"], context: "Staging verified",
  projectId: "p1", projectName: "Mission Control", stepId: null, askedBy: "claude-code", askedAt: "2026-10-03T10:00:00Z",
})
const legacy = { id: "j2", title: "Deploy", unlock_prompt: "Approve the deploy", created_by: "u1", assigned_to: null, created_at: "2026-10-01T00:00:00Z", input: {} }
eq("legacy unlock row → card with no options, prompt as question", toInboxItem(legacy, names), {
  id: "j2", kind: "unlock", question: "Approve the deploy", options: [], context: null,
  projectId: null, projectName: null, stepId: null, askedBy: null, askedAt: "2026-10-01T00:00:00Z",
})
eq("unlock with no prompt falls back to title", toInboxItem({ ...legacy, unlock_prompt: null }, names).question, "Deploy")
eq("unknown project id → null name", toInboxItem({ ...qRow, input: { ...qRow.input, projectId: "zz" } }, names).projectName, null)
eq("input as JSON string is parsed", toInboxItem({ ...qRow, input: JSON.stringify(qRow.input) }, names).options, ["Yes", "No"])
eq("garbage options filtered to strings", toInboxItem({ ...qRow, input: { kind: "question", options: ["A", 3, null, "B"] } }, names).options, ["A", "B"])

// ── resolveAnswer ───────────────────────────────────────────────────
const item = toInboxItem(qRow, names)
eq("option answer", resolveAnswer(item, { option: "Yes" }), { ok: true, answer: { option: "Yes", reply: null, note: "Yes" } })
eq("option + reply", resolveAnswer(item, { option: "No", reply: " not yet " }), { ok: true, answer: { option: "No", reply: "not yet", note: "No — not yet" } })
eq("reply only", resolveAnswer(item, { reply: "Ship Monday" }), { ok: true, answer: { option: null, reply: "Ship Monday", note: "Ship Monday" } })
eq("unknown option rejected", resolveAnswer(item, { option: "Maybe" }).ok, false)
eq("option match is exact (no case folding — the agent branches on it)", resolveAnswer(item, { option: "yes" }).ok, false)
eq("empty answer rejected", resolveAnswer(item, { reply: "   " }).ok, false)
eq("nothing rejected", resolveAnswer(item, {}).ok, false)
eq("option on an option-less item rejected", resolveAnswer(toInboxItem(legacy, names), { option: "Yes" }).ok, false)
eq("over-long reply rejected", resolveAnswer(item, { reply: "x".repeat(4001) }).ok, false)

// ── statusAfterAnswer ───────────────────────────────────────────────
eq("a question is done once answered", statusAfterAnswer("question"), "completed")
eq("a paused job goes back to the queue", statusAfterAnswer("unlock"), "queued")

console.log(`${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
