/* Run: npx -y tsx@4.23.15 lib/ai/chat-format.assert.ts */
import { toUIMessages, isUuid } from "./chat-format"
let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

eq("text message", toUIMessages([{ id: "1", role: "user", content: "hi" }]), [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }])
eq("createdAt normalised to ISO", toUIMessages([{ id: "1", role: "assistant", content: "x", createdAt: "2026-10-03T10:00:00Z" }])[0].createdAt, "2026-10-03T10:00:00.000Z")
eq("file parts kept after text", toUIMessages([{ id: "1", role: "user", content: "see", parts: [{ type: "file", url: "u", mediaType: "image/png" }] }])[0].parts,
  [{ type: "text", text: "see" }, { type: "file", url: "u", mediaType: "image/png" }])
eq("legacy tool-invocation parts dropped", toUIMessages([{ id: "1", role: "assistant", content: "done", parts: [{ type: "tool-invocation" }] }])[0].parts, [{ type: "text", text: "done" }])
eq("empty assistant (tool-only turn) skipped", toUIMessages([{ id: "1", role: "assistant", content: "" }]), [])
eq("whitespace-only skipped", toUIMessages([{ id: "1", role: "assistant", content: "  \n" }]), [])
eq("unknown role skipped", toUIMessages([{ id: "1", role: "tool", content: "x" }]), [])
eq("order preserved", toUIMessages([{ id: "a", role: "user", content: "q" }, { id: "b", role: "assistant", content: "a" }]).map((m) => m.id), ["a", "b"])
eq("non-array parts ignored", toUIMessages([{ id: "1", role: "user", content: "x", parts: "junk" }])[0].parts.length, 1)
eq("isUuid accepts a uuid", isUuid("9f0b0d1e-f679-40b6-8cad-8492aae98675"), true)
eq("isUuid rejects junk", isUuid("abc") || isUuid(undefined) || isUuid("9f0b0d1e-f679-40b6-8cad-8492aae9867"), false)

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
