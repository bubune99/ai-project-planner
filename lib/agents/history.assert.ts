/* Run: npx -y tsx@4.23.15 lib/agents/history.assert.ts */
import { toolNote, contentForModel } from "./history"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got  ${a}\n  want ${b}`) } }

const trace = [
  { id: "1", kind: "agent", label: "jarvis", status: "ok" },
  { id: "2", kind: "tool", label: "catch_me_up", status: "ok" },
  { id: "3", kind: "tool", label: "catch_me_up", status: "ok" },
  { id: "4", kind: "tool", label: "my_work", status: "ok" },
  { id: "5", kind: "tool", label: "create_task", status: "error" },
]
eq("names each successful tool once, skips agents and errors", toolNote({ trace }), "\n\n[Tools used for this reply: catch_me_up, my_work]")
eq("no trace, no note", toolNote({}), "")
eq("null metadata, no note", toolNote(null), "")
eq("non-array trace, no note", toolNote({ trace: "x" }), "")
eq("only agent spans, no note", toolNote({ trace: [{ kind: "agent", label: "jarvis", status: "ok" }] }), "")
eq("junk spans are ignored", toolNote({ trace: [null, 3, "x", { kind: "tool" }, { kind: "tool", label: 5 }] }), "")
const many = { trace: Array.from({ length: 10 }, (_, i) => ({ kind: "tool", label: `t${i}`, status: "ok" })) }
eq("long lists are capped", toolNote(many), "\n\n[Tools used for this reply: t0, t1, t2, t3, t4, t5, t6, t7, …]")
eq("assistant content gets the note", contentForModel({ role: "assistant", content: "Done.", metadata: { trace } }), "Done.\n\n[Tools used for this reply: catch_me_up, my_work]")
eq("user content is untouched", contentForModel({ role: "user", content: "hi", metadata: { trace } }), "hi")
eq("missing content is empty", contentForModel({ role: "user" }), "")
console.log(`history.assert: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
