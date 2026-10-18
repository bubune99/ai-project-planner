import { showUnit } from "./ui-tools"
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
eq("unknown is not a guess", r("the flux capacitor").ok, false)
eq("caption capped", (showUnit({ unit: "history", caption: "x".repeat(400) }) as { caption: string }).caption.length, 140)
console.log(`ui-tools.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
