/*
 * In-app agent definitions: instructions, model, and the exact planner tools
 * each one may call. Tools come from lib/mcp/planner-tools.ts — the same code
 * the MCP endpoint serves — so an agent here and an external agent over MCP
 * behave the same. Allowlists are checked against the real tool names in
 * lib/agents/registry.assert.ts.
 *
 * Never allowlisted in-app:
 *   set_active_project, register_workspace — write to the caller's API-key
 *     row; an in-app session has none. The page you are on sets the project.
 *   worker/job plumbing (register_worker, heartbeat_worker, claim_job,
 *     request_unlock, resolve_unlock, update_job_status) — for workers.
 *   ask_owner — the owner is already in the conversation.
 *   delete_todo, restore_document_version, catalog_scan_now — destructive or
 *     expensive; not without a confirmation step, which this UI lacks yet.
 */

import { AGENTS, DEFAULT_AGENT_ID, type AgentId } from "./catalog"

export const MODELS = {
  main: "claude-sonnet-5-5",
  fast: "claude-haiku-4-5-20251001",
} as const

/**
 * Tools that look back over the owner's history. Added to an agent only when
 * the owner turns Memory on for the message ("search chats for context and
 * memory stores"). The Researcher keeps search_memory regardless: searching
 * records is its job.
 */
export const MEMORY_TOOLS: readonly string[] = ["search_chats", "search_memory"]

export interface AgentDefinition {
  id: AgentId
  name: string
  model: string
  maxSteps: number
  tools: readonly string[]
  /** Agents this one may hand a task to via the delegate tool. */
  delegates: readonly AgentId[]
  instructions: string
}

export const NEVER_IN_APP: readonly string[] = [
  "set_active_project", "register_workspace",
  "register_worker", "heartbeat_worker", "claim_job", "request_unlock", "resolve_unlock", "update_job_status",
  "ask_owner",
  "delete_todo", "restore_document_version", "catalog_scan_now",
]

const SHARED_RULES = `
## How you work
- You act through tools. Never claim you created, changed or found something unless a tool call in this conversation did it and succeeded. If a tool returns an error, say so plainly.
- Read before you write: look up the project, task or document before changing it.
- Prefer one summary call over many detail calls. For counts across projects use project_workload — never call get_project_tasks once per project. If a question would need more than about five detail calls, answer from summaries and offer to go deeper.
- Project work goes on the project plan (create_task / update_task). create_todo is only for the owner's personal items, or things waiting on someone. A choice to be made is create_decision.
- Before changing more than three things at once, list what you will change and ask first.
- Be concise. Lead with the answer. Use short markdown lists or tables for data; no filler.
- Dates: use ISO yyyy-mm-dd. Today's date is given below.`

const DEFS: Record<AgentId, Omit<AgentDefinition, "id" | "name">> = {
  jarvis: {
    model: MODELS.main,
    maxSteps: 12,
    delegates: ["operator", "researcher"],
    tools: [
      "get_dashboard", "list_projects", "project_workload", "get_project_context", "get_project_tasks", "list_phases", "get_execution_plan",
      "list_documents", "read_document", "list_todos", "list_ideas", "get_idea", "list_decisions",
      "global_search", "get_agenda", "list_awaiting_unlocks", "find_related", "library_search",
      "get_answer",
      "create_task", "update_task", "add_task_comment", "create_todo", "update_todo", "toggle_todo",
      "create_decision", "add_progress_note", "create_event", "create_idea",
    ],
    instructions: `You are JARVIS, the owner's assistant inside their project planner. You see every project they own.

Answer directly when you can. Hand work to a specialist with the delegate tool when it is clearly theirs:
- operator — multi-step project plan changes: phases, work orders, documents, restructuring tasks.
- researcher — digging through memory, the library, ideas and past attempts to answer "what do we know / what have we tried".
Give the specialist a complete, self-contained task; it does not see this conversation. Relay its answer, don't repeat its work.${SHARED_RULES}`,
  },
  operator: {
    model: MODELS.main,
    maxSteps: 16,
    delegates: [],
    tools: [
      "get_project_context", "list_projects", "project_workload", "get_project_tasks", "list_phases", "get_execution_plan",
      "create_task", "update_task", "assign_task", "add_task_comment", "transition_phase",
      "compose_work_order", "work_order_check_in",
      "list_documents", "read_document", "create_document", "update_document", "list_document_versions",
      "list_decisions", "create_decision", "add_decision_node",
      "add_progress_note", "entity_link", "find_related", "get_5wh",
    ],
    instructions: `You are the Project Operator. You run a project's plan: tasks and their status, phases, work orders, documents and decisions.

Start from get_project_context for the project in question. Keep the plan truthful: a task is done only when its work is done; move phases with transition_phase only when the current phase's work is complete. Record why with add_progress_note when you make a material change.${SHARED_RULES}`,
  },
  researcher: {
    model: MODELS.main,
    maxSteps: 14,
    delegates: [],
    tools: [
      "search_memory", "global_search", "library_search", "library_get", "library_list_skills", "library_list_templates",
      "library_list_protocols", "find_attempts", "find_related", "get_knowledge_graph", "get_5wh",
      "list_projects", "get_project_context", "list_ideas", "get_idea", "list_documents", "read_document",
      "list_decisions", "catalog_search", "catalog_get", "analyze_impact",
    ],
    instructions: `You are the Researcher. You are read-only: you search and report, you never change anything.

Search more than one source before concluding (memory, library, ideas, documents, decisions, past attempts). Cite what you found by name and id. Separate what the records say from your own inference, and say plainly when nothing relevant exists.${SHARED_RULES}`,
  },
}

export const REGISTRY: Record<AgentId, AgentDefinition> = Object.fromEntries(
  AGENTS.map((a) => [a.id, { id: a.id, name: a.name, ...DEFS[a.id] }]),
) as Record<AgentId, AgentDefinition>

export function resolveAgent(id: unknown): AgentDefinition {
  return typeof id === "string" && id in REGISTRY ? REGISTRY[id as AgentId] : REGISTRY[DEFAULT_AGENT_ID]
}

/** The allowlist for one request: memory tools join only when Memory is on. */
export function toolsForRequest(agent: AgentDefinition, memory: boolean): string[] {
  const base = memory ? agent.tools : agent.tools.filter((t) => agent.id === "researcher" || !MEMORY_TOOLS.includes(t))
  return memory ? [...new Set([...base, ...MEMORY_TOOLS])] : [...base]
}

/** Per-request context appended to an agent's instructions. Pure: date injected. */
export function contextBlock(opts: { today: string; projectId?: string | null; projectName?: string | null; chatId?: string | null; memory?: boolean }): string {
  const lines = [`\n## Context`, `- Today: ${opts.today}`]
  if (opts.memory) {
    lines.push(`- Memory is on: search past chats (search_chats) and the memory store (search_memory) when earlier context would help.${opts.chatId ? ` This chat is ${opts.chatId}; pass it as excludeChatId.` : ""}`)
  }
  lines.push(opts.projectId
    ? `- The owner is looking at project "${opts.projectName ?? "unknown"}" (${opts.projectId}). Tools that take a projectId default to it.`
    : `- No project is open. Ask which project, or use list_projects, before project-specific work.`)
  return lines.join("\n")
}
