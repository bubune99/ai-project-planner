/* Run: npx -y tsx@4.23.15 lib/agents/registry.assert.ts */
import { readFileSync } from "fs"
import { REGISTRY, NEVER_IN_APP, resolveAgent, contextBlock } from "./registry"
import { AGENTS, DEFAULT_AGENT_ID, isAgentId } from "./catalog"

let pass = 0, fail = 0
const ok = (n: string, c: boolean, detail?: unknown) => { if (c) pass++; else { fail++; console.error(`FAIL ${n}`, detail ?? "") } }

// Real tool inventory, read from source (the module itself needs a database).
const src = readFileSync(new URL("../mcp/planner-tools.ts", import.meta.url), "utf8").replace(/\r/g, "")
const starts = [...src.matchAll(/server\.tool\(\s*"([^"]+)"/g)].map((m) => ({ name: m[1], at: m.index! }))
const tools = new Map(starts.map((t, i) => [t.name, src.slice(t.at, starts[i + 1]?.at ?? src.length)]))
const isWrite = (n: string) => /requireMcpScope\("write"\)/.test(tools.get(n) ?? "")

ok("found the 99 planner tools", tools.size === 99, tools.size)
ok("catalog and registry list the same agents", AGENTS.map((a) => a.id).join() === Object.keys(REGISTRY).join())
ok("default agent exists", DEFAULT_AGENT_ID in REGISTRY)

for (const a of Object.values(REGISTRY)) {
  const unknown = a.tools.filter((t) => !tools.has(t))
  ok(`${a.id}: every allowlisted tool exists`, unknown.length === 0, unknown)
  const banned = a.tools.filter((t) => NEVER_IN_APP.includes(t))
  ok(`${a.id}: no never-in-app tool`, banned.length === 0, banned)
  ok(`${a.id}: no duplicates in allowlist`, new Set(a.tools).size === a.tools.length)
  ok(`${a.id}: delegates are other known agents`, a.delegates.every((d) => d !== a.id && d in REGISTRY), a.delegates)
  ok(`${a.id}: has instructions`, a.instructions.length > 200)
  ok(`${a.id}: tool count fits a prompt (<= 40)`, a.tools.length <= 40, a.tools.length)
}
for (const n of NEVER_IN_APP) ok(`never-in-app "${n}" is a real tool`, tools.has(n))

const rWrites = REGISTRY.researcher.tools.filter(isWrite)
ok("researcher is read-only", rWrites.length === 0, rWrites)
ok("jarvis can write (creates tasks)", REGISTRY.jarvis.tools.some(isWrite))
// Delegation is one level deep: a specialist can't hand off again.
ok("specialists don't delegate", REGISTRY.operator.delegates.length === 0 && REGISTRY.researcher.delegates.length === 0)

ok("resolveAgent: known id", resolveAgent("researcher").id === "researcher")
ok("resolveAgent: unknown falls back to default", resolveAgent("chat-model").id === DEFAULT_AGENT_ID)
ok("resolveAgent: non-string falls back", resolveAgent(undefined).id === DEFAULT_AGENT_ID)
ok("isAgentId", isAgentId("operator") && !isAgentId("grok"))

const withP = contextBlock({ today: "2026-10-03", projectId: "p1", projectName: "Atlas" })
ok("context names the project and date", withP.includes('"Atlas" (p1)') && withP.includes("2026-10-03"))
ok("context without project says so", contextBlock({ today: "2026-10-03" }).includes("No project is open"))

console.log(`${pass} passed, ${fail} failed`); if (fail) process.exit(1)
