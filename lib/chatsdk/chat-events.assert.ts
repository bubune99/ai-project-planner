import { asQuote, askStub } from "./chat-events"
let pass = 0, fail = 0
const eq = (m: string, a: unknown, b: unknown) => { a === b ? pass++ : (fail++, console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b))) }
eq("quote basic", asQuote("hello  world"), "> hello world\n\n")
eq("quote caps", asQuote("a".repeat(500)).length, 2 + 280 + 2)
eq("quote ends with ellipsis", asQuote("a".repeat(500)).endsWith("…\n\n"), true)
eq("stub with text", askStub("Fix  login", "/todos"), "About “Fix login” on /todos: ")
eq("stub without text", askStub("   ", "/todos"), "About this page (/todos): ")
eq("stub clips", askStub("x".repeat(300), "/p").length < 190, true)
console.log(`chat-events.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
