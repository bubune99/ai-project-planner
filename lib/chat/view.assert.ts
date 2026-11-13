import assert from "node:assert/strict"
import { agentChoices, chatBody, errorText, groupChats, toView, type ChatMessage } from "./view"

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok ", name) }
const msg = (id: string, role: string, parts: unknown[]) => ({ id, role, parts }) as unknown as ChatMessage

ok("text and reasoning become parts; empty and system messages are dropped", () => {
  const v = toView([
    msg("s", "system", [{ type: "text", text: "hidden" }]),
    msg("u", "user", [{ type: "text", text: "Hi" }]),
    msg("e", "assistant", [{ type: "text", text: "" }]),
    msg("a", "assistant", [{ type: "reasoning", text: "thinking" }, { type: "text", text: "One" }, { type: "text", text: "Two<has_function_call>" }]),
  ])
  assert.deepEqual(v.map((m) => m.id), ["u", "a"])
  assert.deepEqual(v[1].parts.map((p) => p.kind), ["reasoning", "text", "text"])
  assert.equal(v[1].text, "One\nTwo")
})

ok("a user's reasoning part is never shown", () => {
  assert.deepEqual(toView([msg("u", "user", [{ type: "reasoning", text: "x" }, { type: "text", text: "Q" }])])[0].parts, [{ kind: "text", text: "Q" }])
})

ok("agent steps keep the newest state per step, and a reply with only steps still shows", () => {
  const span = (status: string) => ({ id: "1", parentId: null, kind: "tool", name: "t", title: "T", status, start: 0, end: null })
  const v = toView([msg("a", "assistant", [{ type: "data-span", id: "1", data: span("running") }, { type: "data-span", id: "1", data: span("ok") }])])
  assert.equal(v.length, 1)
  assert.equal(v[0].spans.length, 1)
  assert.equal(v[0].spans[0].status, "ok")
})

ok("the request carries the newest message, the agent and the switches", () => {
  const m = msg("u", "user", [{ type: "text", text: "Hi" }])
  const b = chatBody({ id: "c1", message: m, agentId: "operator", thinking: true, memory: false })
  assert.deepEqual(b, { id: "c1", message: m, selectedChatModel: "operator", selectedVisibilityType: "private", thinking: true, memory: false })
})

ok("project and screen go in context only when present", () => {
  const screen = { path: "/todos", title: "My work", units: [] }
  assert.deepEqual(chatBody({ id: "c", message: undefined, agentId: "jarvis", projectId: "p1", screen, thinking: false, memory: true }).context, { projectId: "p1", screen })
  assert.equal("context" in chatBody({ id: "c", message: undefined, agentId: "jarvis", projectId: null, thinking: false, memory: false }), false)
})

ok("errors use the server's words, then plain ones", () => {
  assert.equal(errorText(429, { error: "Daily limit reached. Resets at 7 PM." }), "Daily limit reached. Resets at 7 PM.")
  assert.match(errorText(429, {}), /limit/)
  assert.match(errorText(401, null), /sign in/)
  assert.match(errorText(500, { error: 42 }), /couldn't answer/)
  assert.match(errorText(0, null, false), /offline/)
})

ok("history groups by day, newest groups first, empty ones left out", () => {
  const now = new Date(2026, 10, 13, 15)
  const at = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString()
  const g = groupChats([
    { id: "a", title: "a", createdAt: at(13) }, { id: "b", title: "b", createdAt: at(12, 23) },
    { id: "c", title: "c", createdAt: at(8) }, { id: "d", title: "d", createdAt: at(1) },
  ], now)
  assert.deepEqual(g.map(([l, list]) => [l, list.map((c) => c.id)]), [["Today", ["a"]], ["Yesterday", ["b"]], ["This week", ["c"]], ["Older", ["d"]]])
  assert.deepEqual(groupChats([{ id: "a", title: "a", createdAt: at(13) }], now).map(([l]) => l), ["Today"])
})

ok("agent choices respect what the person is allowed", () => {
  assert.ok(agentChoices().length >= 1)
  assert.deepEqual(agentChoices(["operator"]).map((a) => a.id), ["operator"])
  assert.deepEqual(agentChoices([]), [])
})

console.log(`\n${n} checks passed`)
