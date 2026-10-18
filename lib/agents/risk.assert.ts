/* Run: npx -y tsx@4.23.15 lib/agents/risk.assert.ts */
import { readFileSync } from "node:fs"
import { PLANNER_TOOL_RISK, riskOfPlannerTool, inAppEligible, enforceRisk, blockedByRisk } from "./risk"
import { REGISTRY } from "./registry"
import { agentMay } from "../ade/ui/control"

let pass = 0, fail = 0
const eq = (n: string, g: unknown, w: unknown) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a === b) pass++; else { fail++; console.error(`FAIL ${n}\n  got  ${a}\n  want ${b}`) } }

// 1. The map covers exactly the tools registered in lib/mcp/planner-tools.ts.
const src = readFileSync(new URL("../mcp/planner-tools.ts", import.meta.url), "utf8")
const registered = [...new Set([...src.matchAll(/server\.tool\(\s*["']([a-z0-9_]+)["']/g)].map((m) => m[1]))].sort()
const classified = Object.keys(PLANNER_TOOL_RISK).sort()
eq("every registered tool is classified", registered.filter((t) => !classified.includes(t)), [])
eq("no classified tool is unregistered", classified.filter((t) => !registered.includes(t)), [])

// 2. Classes.
eq("money tool", riskOfPlannerTool("create_transaction"), "money")
eq("irreversible = destructive", riskOfPlannerTool("delete_todo"), "destructive")
eq("live write = commit", riskOfPlannerTool("update_task"), "commit")
eq("read", riskOfPlannerTool("get_project_context"), "read")
eq("unknown tool is destructive (not offered)", riskOfPlannerTool("brand_new_tool"), "destructive")
eq("agent only points at commit", agentMay("commit"), "point")
eq("agent approves money", agentMay("money"), "approve")

// 3. Eligibility for the in-app chat, whatever an allowlist says.
const must = ["create_transaction", "list_transactions", "get_finance_summary", "list_accounts", "delete_todo", "restore_document_version",
  "claim_job", "register_worker", "set_active_project", "register_workspace", "ask_owner", "request_unlock", "brand_new_tool"]
eq("blocked: money, finance, destructive, worker, unknown", must.filter(inAppEligible), [])
eq("kept: reads and live writes", ["get_dashboard", "create_task", "toggle_todo"].filter(inAppEligible), ["get_dashboard", "create_task", "toggle_todo"])
eq("enforceRisk keeps order and drops blocked", enforceRisk(["get_dashboard", "delete_todo", "update_task", "create_transaction"]), ["get_dashboard", "update_task"])
eq("blockedByRisk lists the removed", blockedByRisk(["get_dashboard", "delete_todo", "create_transaction"]), ["delete_todo", "create_transaction"])

// 4. The current allowlists lose nothing (no behavior change), and the read-only agent is read-only.
for (const [id, a] of Object.entries(REGISTRY)) {
  eq(`${id}: allowlist has nothing the risk map blocks`, blockedByRisk(a.tools), [])
}
eq("researcher allowlist is read-only", REGISTRY.researcher.tools.filter((t) => riskOfPlannerTool(t) !== "read"), [])

// 5. Snapshot: live-write tools the in-app agents can call directly today. Slice S3 turns these into proposals;
//    a change here must be a decision, so it fails until the snapshot is updated on purpose.
const direct = new Set<string>()
for (const a of Object.values(REGISTRY)) for (const t of a.tools) if (riskOfPlannerTool(t) === "commit" && !PLANNER_TOOL_RISK[t].directOk) direct.add(t)
eq("write tools to convert to proposals in S3", [...direct].sort(), [
  "add_decision_node", "add_task_comment", "assign_task", "compose_work_order", "create_decision", "create_document", "create_event",
  "create_idea", "create_task", "create_todo", "entity_link", "transition_phase", "update_document", "update_task", "update_todo", "work_order_check_in",
])

console.log(`risk.assert: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
