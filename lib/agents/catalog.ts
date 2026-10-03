/*
 * The in-app agents, as the UI sees them: id, name, one line. Client-safe —
 * no instructions, tools or server imports. The agent picker in /chat reads
 * this; lib/agents/registry.ts holds the full definitions.
 */

export type AgentId = "jarvis" | "operator" | "researcher"

export interface AgentSummary {
  id: AgentId
  name: string
  description: string
}

export const AGENTS: AgentSummary[] = [
  {
    id: "jarvis",
    name: "JARVIS",
    description: "Your general assistant across every project. Hands off to the specialists when a job needs one.",
  },
  {
    id: "operator",
    name: "Project Operator",
    description: "Runs a project's plan: tasks, phases, work orders, documents and decisions.",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Read-only. Searches memory, the library, ideas, documents and past attempts, and cites what it finds.",
  },
]

export const DEFAULT_AGENT_ID: AgentId = "jarvis"

export function isAgentId(v: unknown): v is AgentId {
  return typeof v === "string" && AGENTS.some((a) => a.id === v)
}
