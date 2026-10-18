/* Run: npx -y tsx@4.23.15 lib/agents/access.runtime.assert.ts
 *
 * Runs the REAL handlers in lib/mcp/planner-tools.ts against a fake sql (no
 * database, no network). For every project-role-checked write tool a viewer
 * must get a refusal AND no INSERT/UPDATE/DELETE may reach the database; an
 * editor must get past the role gate. Both an API-key call (no run binding)
 * and an in-app run bound to the project are tried.
 */
import { collectTools, resultText } from "./tool-bridge"
import { projectScopedWriteTools } from "./access"

let pass = 0, fail = 0
const ok = (n: string, c: boolean, detail?: unknown) => { if (c) pass++; else { fail++; console.error(`FAIL ${n}`, detail ?? "") } }

const ME = "user-me", PROJECT = "proj-1"
let role: "owner" | "viewer" | "editor" = "viewer"
let queries: string[] = []

const row = { id: "row-1", project_id: PROJECT, user_id: ME, created_by: ME, status: "active", wo_status: "active", claimed_by_id: "a", prerequisites: [], title: "t" }
function fakeSql(strings: TemplateStringsArray | string) {
  const text = (Array.isArray(strings) ? (strings as readonly string[]).join("?") : String(strings)).replace(/\s+/g, " ")
  queries.push(text)
  // verifyMcpProjectAccess: the owner probe, then the collaborator role probe.
  if (/SELECT 1 FROM projects/.test(text) && /user_id =/.test(text)) return Promise.resolve(role === "owner" ? [{ "?column?": 1 }] : [])
  if (/SELECT role FROM project_collaborators/.test(text)) return Promise.resolve(role === "owner" ? [] : [{ role }])
  return Promise.resolve([row])
}
const WRITES = /\b(INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM)\b/i

// Replace the database module before anything imports it.
const clientPath = require.resolve("../db/client")
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: { sql: fakeSql, pool: {} }, children: [], paths: [] } as unknown as NodeJS.Module

// One superset of arguments; each handler reads the keys it declares.
const ARGS: Record<string, unknown> = {
  projectId: PROJECT, project_id: PROJECT, stepId: "step-1", step_id: "step-1", taskId: "step-1", todoId: "todo-1", decisionId: "dec-1",
  documentId: "doc-1", work_order_id: "wo-1", jobId: "job-1", versionId: "ver-1", version: 1, phase: "design", toPhase: "design", targetPhase: "design",
  title: "T", name: "n", content: "C", description: "D", noteType: "update", status: "in_progress", priority: "medium", kind: "service",
  assignee: "agent", assignedAgent: "claude", agent_id: "agent-1", agent_type: "agent", reasoning: "R", problem: "P", approachTried: "A",
  failureMode: "F", lessonLearned: "L", approach: "A", outcome: "failed", entity_type: "project", entity_id: PROJECT, question: "Q?", body: "B",
  rationale: "because", canonical_id: "c1", location: {}, signature: {}, text: "x", comment: "x", event_type: "progress", message: "m",
  git_remote: "git@x:y/z.git", workspace_path: "/w", steps: [], required_skills: [], alternatives: [], tasks: [], tags: [],
}

// Failures that mean "you may not write here" in the tools' own words.
const REFUSAL = /read-only access|view-only access|view only|no write access/i

async function main() {
  const { registerPlannerTools } = await import("../mcp/planner-tools")
  const { runWithMcpContext } = await import("../auth/mcp-context")
  const tools = await collectTools(registerPlannerTools)

  const call = async (name: string, who: typeof role, bound: boolean) => {
    role = who
    queries = []
    const ctx = { userId: ME, apiKeyId: "k", scopes: ["read", "write"], ...(bound ? { writeBoundProjectId: PROJECT } : {}) }
    const t = tools.get(name)!
    const out = (await runWithMcpContext(ctx, () => t.handler({ ...ARGS }, {}))) as unknown
    return { ...resultText(out), wrote: queries.some((q) => WRITES.test(q)) }
  }

  const names = projectScopedWriteTools()
  for (const name of names) {
    ok(`${name}: registered`, tools.has(name))
    if (!tools.has(name)) continue
    for (const bound of [false, true]) {
      const label = `${name} (${bound ? "in-app run bound to the project" : "API key"})`
      const v = await call(name, "viewer", bound)
      // register_workspace reports a refused binding as an error without the role wording; it must still fail and write nothing.
      ok(`${label}: viewer is refused`, v.isError && (REFUSAL.test(v.text) || name === "register_workspace"), v.text.slice(0, 120))
      ok(`${label}: viewer writes nothing`, !v.wrote, queries.filter((q) => WRITES.test(q)).map((q) => q.slice(0, 80)))
      const e = await call(name, "editor", bound)
      ok(`${label}: editor passes the role gate`, !REFUSAL.test(e.text), e.text.slice(0, 120))
    }
  }

  // Personal todos stay editable and tools with no project are not blocked.
  role = "viewer"
  queries = []
  const personal = await runWithMcpContext({ userId: ME, apiKeyId: "k", scopes: ["read", "write"], writeBoundProjectId: PROJECT }, () =>
    tools.get("create_todo")!.handler({ title: "buy milk" }, {})) as unknown
  ok("create_todo with no project works for a viewer", !resultText(personal).isError, resultText(personal).text)

  console.log(`access.runtime.assert: ${pass} passed, ${fail} failed (${names.length} project-role-checked tools run)`)
  if (fail) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
