import { showUnit, goTo } from "./ui-tools"
let pass = 0, fail = 0
const eq = (m: string, a: unknown, b: unknown) => { JSON.stringify(a) === JSON.stringify(b) ? pass++ : (fail++, console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b))) }
const r = (s: string) => showUnit({ unit: s }) as { ok: boolean; key?: string; mode?: string }
eq("exact key", r("chat.history").key, "chat.history")
eq("label", r("chat history").key, "chat.history")
eq("alias: old chats", r("where are my old chats").key, "chat.history")
eq("alias: microphone", r("the microphone").key, "chat.mic")
eq("alias: who am I talking to", r("who am I talking to").key, "chat.agent")
eq("tab", r("the inbox").key, "nav.tab.inbox")
eq("default mode is highlight", r("history").mode, "highlight")
eq("spotlight honoured", (showUnit({ unit: "history", mode: "spotlight" }) as { mode: string }).mode, "spotlight")
eq("unknown is passed to the screen, not guessed", [r("the flux capacitor").ok, (r("the flux capacitor") as { key?: string }).key, (r("the flux capacitor") as { ask?: string }).ask], [true, undefined, "the flux capacitor"])
eq("empty is refused", r("   ").ok, false)
eq("caption capped", (showUnit({ unit: "history", caption: "x".repeat(400) }) as { caption: string }).caption.length, 140)
const g = (w: string, p?: string, t?: string) => goTo({ where: w, projectId: p, tab: t }) as { ok: boolean; path?: string }
const P = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
eq("go_to inbox", g("inbox").path, "/inbox")
eq("go_to alias todos -> /todos", g("my todos").path, "/todos")
eq("go_to chat history", g("chat history").path, "/chat")
eq("go_to project tab by arg", g("tasks", P, "tasks").path, `/project/${P}?tab=tasks`)
eq("go_to project tab by words", g("the docs tab", P).path, `/project/${P}?tab=docs`)
eq("go_to bad project id falls back to page", g("tasks", "not-a-uuid").ok, false)
eq("go_to unknown", g("moon base").ok, false)
console.log(`ui-tools.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
