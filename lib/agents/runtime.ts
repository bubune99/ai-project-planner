/*
 * Assembles an in-app agent for one request: its tools (bridged from the
 * planner's MCP tools, run as the signed-in user), its instructions with the
 * request context, and — for agents with delegates — a delegate tool that
 * runs a specialist to completion and returns its answer.
 *
 * Server-only (imports the planner tools, which import the database).
 */

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, stepCountIs, tool, type Tool } from "ai"
import { z } from "zod"
import { registerPlannerTools } from "@/lib/mcp/planner-tools"
import { runWithMcpContext, type McpContext } from "@/lib/auth/mcp-context"
import { collectTools, toAiTools, type CollectedTool } from "./tool-bridge"
import { REGISTRY, contextBlock, type AgentDefinition } from "./registry"
import type { AgentId } from "./catalog"

// The tool set is identical for every request; collect it once per instance.
let collected: Promise<Map<string, CollectedTool>> | null = null
function plannerTools() {
  if (!collected) collected = collectTools(registerPlannerTools).catch((e) => { collected = null; throw e })
  return collected
}

export interface AgentRequest {
  userId: string
  projectId?: string | null
  projectName?: string | null
  today: string
}

function contextFor(agent: AgentDefinition, req: AgentRequest): McpContext {
  const writes = agent.tools.length > 0 && agent.id !== "researcher"
  return {
    userId: req.userId,
    // Not a real api_keys row. The tools that write to api_keys
    // (set_active_project, register_workspace) are never allowlisted in-app.
    apiKeyId: `in-app:${agent.id}`,
    // Defence in depth: the read-only agent cannot pass a write-scope check
    // even if a write tool were added to its allowlist by mistake.
    scopes: writes ? ["read", "write"] : ["read"],
    activeProjectId: req.projectId ?? undefined,
  }
}

async function toolsFor(agent: AgentDefinition, req: AgentRequest): Promise<Record<string, Tool>> {
  const all = await plannerTools()
  const ctx = contextFor(agent, req)
  const run = <T,>(fn: () => Promise<T>) => runWithMcpContext(ctx, fn) as Promise<T>
  const tools = toAiTools(all, agent.tools, run)
  if (agent.delegates.length) tools.delegate = delegateTool(agent, req)
  return tools
}

function delegateTool(parent: AgentDefinition, req: AgentRequest): Tool {
  const ids = parent.delegates as [AgentId, ...AgentId[]]
  return tool({
    description:
      `Hand a self-contained task to a specialist agent and get its answer back. ` +
      `Specialists: ${ids.map((id) => `${id} (${REGISTRY[id].name})`).join(", ")}. ` +
      `They do not see this conversation, so include everything they need.`,
    inputSchema: z.object({
      agent: z.enum(ids),
      task: z.string().min(10).describe("The full task, with the project, ids and constraints it needs"),
    }),
    execute: async ({ agent: id, task }) => {
      const sub = REGISTRY[id]
      try {
        const result = await generateText({
          model: anthropic(sub.model),
          system: sub.instructions + contextBlock(req),
          prompt: task,
          tools: await toolsFor(sub, req),
          stopWhen: stepCountIs(sub.maxSteps),
        })
        return {
          agent: sub.name,
          answer: result.text || "(the specialist finished without a written answer)",
          toolsUsed: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
        }
      } catch (e: unknown) {
        return { agent: sub.name, answer: `Error: ${e instanceof Error ? e.message : String(e)}`, toolsUsed: [] }
      }
    },
  })
}

export async function prepareAgent(agent: AgentDefinition, req: AgentRequest) {
  return {
    model: anthropic(agent.model),
    system: agent.instructions + contextBlock(req),
    tools: await toolsFor(agent, req),
    stopWhen: stepCountIs(agent.maxSteps),
  }
}
