/* Run: npx -y tsx@4.23.15 lib/agents/tool-bridge.assert.ts */
import { z } from "zod"
import { collectTools, toAiTools, resultText } from "./tool-bridge"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got:  ${a}\n  want: ${b}`) } }

async function main() {
  let ctxDepth = 0
  const seen: unknown[] = []
  const fakeRegister = (server: any) => {
    server.tool("echo", "Echo it back", { msg: z.string() }, async ({ msg }: any) => {
      seen.push({ msg, inContext: ctxDepth > 0 })
      return { content: [{ type: "text", text: `echo:${msg}` }] }
    })
    server.tool("fails", "Returns an MCP error", {}, async () => ({ content: [{ type: "text", text: "nope" }], isError: true }))
    server.tool("throws", "Throws", {}, async () => { throw new Error("boom") })
    server.tool("nodesc", async () => ({ content: [{ type: "text", text: "x" }] }))
  }
  const run = async <T,>(fn: () => Promise<T>) => { ctxDepth++; try { return await fn() } finally { ctxDepth-- } }

  const collected = await collectTools(fakeRegister)
  eq("collects every registered tool", [...collected.keys()], ["echo", "fails", "throws", "nodesc"])
  eq("description captured", collected.get("echo")!.description, "Echo it back")
  eq("missing description falls back to name", collected.get("nodesc")!.description, "nodesc")

  const ai = toAiTools(collected, ["echo", "fails", "throws"], run)
  eq("only allowlisted tools are exposed", Object.keys(ai), ["echo", "fails", "throws"])
  const exec = (n: string, input: unknown) => (ai[n] as any).execute(input, { toolCallId: "t", messages: [] })
  eq("handler output flattened to text", await exec("echo", { msg: "hi" }), "echo:hi")
  eq("handler ran inside the context", seen, [{ msg: "hi", inContext: true }])
  eq("MCP isError becomes an Error: string", await exec("fails", {}), "Error: nope")
  eq("a throwing handler becomes an Error: string, not a crash", await exec("throws", {}), "Error: boom")
  eq("input schema is the tool's zod shape", (ai.echo as any).inputSchema.safeParse({ msg: 1 }).success, false)

  let threw = ""
  try { toAiTools(collected, ["missing"], run) } catch (e: any) { threw = e.message }
  eq("an allowlisted name that doesn't exist fails loudly", threw, 'agent allowlists unknown tool "missing"')

  threw = ""
  try { await collectTools((s: any) => { s.tool("a", async () => 1); s.tool("a", async () => 2) }) } catch (e: any) { threw = e.message }
  eq("duplicate registration fails loudly (the cold-start crash class)", threw, "tool a registered twice")

  eq("resultText joins text parts", resultText({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] }), { text: "a\nb", isError: false })
  eq("resultText passes strings through", resultText("plain"), { text: "plain", isError: false })

  console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
}
main()
