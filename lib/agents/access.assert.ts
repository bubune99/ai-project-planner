/* Run: npx -y tsx@4.23.15 lib/agents/access.assert.ts */
import { readFileSync } from "node:fs"
import { WRITE_TOOL_SCOPE, VIEWER_PERSONAL_TOOLS, projectScopedWriteTools, scopesForRole, scopesForTools, toolsAllowedForRole } from "./access"
import { PLANNER_TOOL_RISK, riskOfPlannerTool, enforceRisk } from "./risk"
import { REGISTRY, toolsForRequest } from "./registry"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got  ${a}\n  want ${b}`) } }

// (a) The decision table covers exactly the write-class tools in the risk map.
const writeTools = Object.entries(PLANNER_TOOL_RISK).filter(([, m]) => m.effect !== "read").map(([n]) => n).sort()
const decided = Object.keys(WRITE_TOOL_SCOPE).sort()
eq("every write tool has a scope decision", writeTools.filter((t) => !decided.includes(t)), [])
eq("no scope decision for a non-write tool", decided.filter((t) => !writeTools.includes(t)), [])

// (b) Static source check: every project-role-checked tool's handler refuses a viewer.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "")
const src = read("../mcp/planner-tools.ts")
const starts = [...src.matchAll(/server\.tool\(\s*["']([a-z0-9_]+)["']/g)].map((m) => ({ name: m[1], at: m.index! }))
const blocks = new Map(starts.map((t, i) => [t.name, src.slice(t.at, starts[i + 1]?.at ?? src.length)]))
const GUARDS = ["requireMcpProjectWriteAccess", "canWrite", "projectWriteRoleError(", "stepWriteError(", "rowProjectWriteError(", "sourceParentAccessError(", "updateProjectWorkspace("]
for (const name of projectScopedWriteTools()) {
  const block = blocks.get(name) ?? ""
  eq(`${name}: registered`, block.length > 0, true)
  eq(`${name}: handler refuses a viewer`, GUARDS.some((g) => block.includes(g)), true)
}

// The guards that live outside the handler really do check the role.
const fnBody = (text: string, header: string) => { const at = text.indexOf(header); return at < 0 ? "" : text.slice(at, at + 1400) }
eq("sourceParentAccessError checks canWrite", /needWrite && !access\.canWrite/.test(fnBody(src, "async function sourceParentAccessError")), true)
eq("projectWriteRoleError allows only owner, admin, editor", /role !== "owner" && access\.role !== "admin" && access\.role !== "editor"/.test(fnBody(src, "async function projectWriteRoleError")), true)
eq("rowProjectWriteError blocks the viewer role", /role === "viewer"/.test(fnBody(src, "async function rowProjectWriteError")), true)
eq("updateProjectWorkspace checks canWrite", /access\.canWrite/.test(fnBody(read("../auth/mcp-context.ts"), "export async function updateProjectWorkspace")), true)

const PLAIN = "You have read-only access to this project."
// The four gaps closed in S1b answer a viewer in plain words.
for (const t of ["create_decision", "create_todo", "update_todo", "create_agent_job"]) {
  const b = blocks.get(t) ?? ""
  const viaHelper = b.includes("projectWriteRoleError(") && fnBody(src, "async function projectWriteRoleError").includes(PLAIN)
  eq(`${t}: plain read-only message`, b.includes(PLAIN) || viaHelper, true)
}

// Personal tools never take a project id as input they would act on without a check.
for (const [name, scope] of Object.entries(WRITE_TOOL_SCOPE)) {
  if (scope !== "personal") continue
  const block = blocks.get(name) ?? ""
  eq(`${name}: personal tool scopes rows to the caller`, /getMcpUserId\(\)/.test(block) || name === "reset_ai_limits", true)
}

// (c) Truth tables.
eq("owner scopes", scopesForRole("owner"), ["read", "write"])
eq("admin scopes", scopesForRole("admin"), ["read", "write"])
eq("editor scopes", scopesForRole("editor"), ["read", "write"])
eq("viewer scopes", scopesForRole("viewer"), ["read"])
eq("no usable role is read-only (fail closed)", scopesForRole(null), ["read"])

const sample = ["get_dashboard", "get_project_tasks", "list_decisions", "create_task", "update_task", "create_todo", "toggle_todo", "add_progress_note", "create_event", "brand_new_tool"]
const viewerKeeps = ["get_dashboard", "get_project_tasks", "list_decisions", "create_todo", "toggle_todo"]
eq("viewer keeps read-class tools and personal todos only", toolsAllowedForRole(sample, "viewer"), viewerKeeps)
eq("null role (lookup failed) is treated as a viewer", toolsAllowedForRole(sample, null), viewerKeeps)
eq("viewer personal tools are exactly the todo tools", [...VIEWER_PERSONAL_TOOLS], ["create_todo", "update_todo", "toggle_todo"])
eq("scopes: viewer with only reads is read-only", scopesForTools(["get_dashboard"], true), ["read"])
eq("scopes: viewer with personal todos needs write scope", scopesForTools(viewerKeeps, true), ["read", "write"])
eq("scopes: read-only agent never writes", scopesForTools(viewerKeeps, false), ["read"])
eq("editor keeps create_task and everything else", toolsAllowedForRole(sample, "editor"), sample)
eq("admin keeps everything", toolsAllowedForRole(sample, "admin"), sample)
eq("owner keeps everything", toolsAllowedForRole(sample, "owner"), sample)
eq("no project: nothing changes", toolsAllowedForRole(sample, undefined), sample)
eq("input is not mutated", sample.length, 10)

// (d) The shipped agents, offered to a viewer, are read-only; for an owner nothing is lost.
for (const [id, agent] of Object.entries(REGISTRY)) {
  const offered = enforceRisk(toolsForRequest(agent, true))
  const forViewer = toolsAllowedForRole(offered, "viewer")
  eq(`${id}: viewer sees only read-class tools and personal todos`, forViewer.filter((t) => riskOfPlannerTool(t) !== "read" && !VIEWER_PERSONAL_TOOLS.includes(t)), [])
  eq(`${id}: viewer loses only write tools`, offered.filter((t) => !forViewer.includes(t)).filter((t) => riskOfPlannerTool(t) === "read"), [])
  eq(`${id}: owner offered exactly what it is today`, toolsAllowedForRole(offered, "owner"), offered)
  eq(`${id}: editor offered exactly what it is today`, toolsAllowedForRole(offered, "editor"), offered)
}
eq("jarvis keeps its reads for a viewer", toolsAllowedForRole(enforceRisk(toolsForRequest(REGISTRY.jarvis, false)), "viewer").includes("get_dashboard"), true)
eq("jarvis loses create_task for a viewer", toolsAllowedForRole(enforceRisk(toolsForRequest(REGISTRY.jarvis, false)), "viewer").includes("create_task"), false)

console.log(`access.assert: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
