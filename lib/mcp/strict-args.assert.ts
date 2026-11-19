/** Run: npx -y tsx@4.23.15 lib/mcp/strict-args.assert.ts */
import assert from "node:assert/strict"
import { callProblems, problemText, unknownFields } from "./strict-args"

const fields: Record<string, string[]> = { update_task: ["taskId", "status", "title"], list_projects: [] }
const of = (t: string) => fields[t]

assert.deepEqual(unknownFields(["a", "b"], { a: 1 }), [])
assert.deepEqual(unknownFields(["a"], { a: 1, note: "x" }), ["note"])
assert.deepEqual(unknownFields(["a"], undefined), [])
assert.deepEqual(unknownFields(["a"], [1]), [])

// The case that lost the note.
const lost = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "update_task", arguments: { taskId: "6b28d210", status: "completed", note: "Shipped in f2b658d" } } }
const [p] = callProblems(lost, of)
assert.equal(p.id, 7)
assert.deepEqual(p.unknown, ["note"])
assert.match(problemText(p), /update_task does not take "note", so nothing was changed\. It takes: taskId, status, title\. To leave a note on a card, use add_task_comment\./)

// A good call, other methods, unknown tools and batches.
assert.deepEqual(callProblems({ ...lost, params: { name: "update_task", arguments: { taskId: "x" } } }, of), [])
assert.deepEqual(callProblems({ method: "tools/list", id: 1 }, of), [])
assert.deepEqual(callProblems({ method: "tools/call", id: 1, params: { name: "nope", arguments: { z: 1 } } }, of), [], "unknown tools are left to the library")
assert.equal(callProblems([lost, { method: "tools/call", id: 2, params: { name: "list_projects", arguments: { x: 1 } } }], of).length, 2)
assert.deepEqual(callProblems("garbage", of), [])

// The agent guide used to tell agents to send documentation_5wh, which no tool takes.
const env = callProblems({ method: "tools/call", id: 3, params: { name: "update_task", arguments: { taskId: "x", documentation_5wh: {} } } }, of)
assert.match(problemText(env[0]), /records its 5W\+H envelope itself/)
const withWhy = callProblems({ method: "tools/call", id: 4, params: { name: "create_task", arguments: { title: "t", documentation_5wh: {} } } }, () => ["title", "rationale"])
assert.match(problemText(withWhy[0]), /Put the why in rationale instead/)
assert.deepEqual(callProblems(null, of), [])

console.log("strict-args.assert: all checks passed")
