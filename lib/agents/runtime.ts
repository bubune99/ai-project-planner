/*
 * Assembles an in-app agent for one request: its tools (bridged from the
 * planner's MCP tools, run as the signed-in user), its instructions with the
 * request context, and — for agents with delegates — a delegate tool that
 * runs a specialist to completion and returns its answer.
 *
 * With a TraceRecorder, every tool call and every delegated specialist (with
 * that specialist's own tool calls nested under it) is recorded as a span, so
 * the chat can show live progress and a timeline of the run.
 *
 * Server-only (imports the planner tools, which import the database).
 */

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, stepCountIs, tool, type StopCondition, type Tool, type ToolSet } from "ai"
import { z } from "zod"
import { registerPlannerTools } from "@/lib/mcp/planner-tools"
import { runWithMcpContext, type McpContext } from "@/lib/auth/mcp-context"
import { collectTools, toAiTools, type CollectedTool, type ToolObserver } from "./tool-bridge"
import { REGISTRY, contextBlock, toolsForRequest, type AgentDefinition } from "./registry"
import { toolTitle, summarizeResult, type TraceRecorder } from "./trace"
import type { AgentId } from "./catalog"
import { MAX_OUTPUT_TOKENS, usageTokens, type RunBudget } from "@/lib/ai/spend-limits"

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
  /** Show the model's reasoning (Claude extended thinking) for this message. */
  thinking?: boolean
  /** Let the agent search past chats and the memory store for this message. */
  memory?: boolean
  /** The chat this request belongs to — excluded from search_chats. */
  chatId?: string | null
  /**
   * Spend metering for this request (lib/ai/spend-limits.ts). Every model
   * step, main agent and delegates alike, adds to the budget and is recorded
   * durably; a failed record stops the run (fail closed).
   */
  spend: { budget: RunBudget; record: (tokens: number) => Promise<boolean> }
}

/** Stop on the agent's step cap, or once the request's token budget is spent. */
function stopFor(maxSteps: number, req: AgentRequest): StopCondition<ToolSet>[] {
  return [stepCountIs(maxSteps), () => req.spend.budget.exhausted()]
}

/** onStepFinish: count the step's tokens against the request and the day. */
function meterStep(req: AgentRequest) {
  return async ({ usage }: { usage?: Parameters<typeof usageTokens>[0] }) => {
    const tokens = usageTokens(usage)
    req.spend.budget.add(tokens)
    const ok = await req.spend.record(tokens)
    if (!ok) req.spend.budget.failed = true
  }
}

/** Extended-thinking budget when the owner asks to see the reasoning. */
const THINKING_BUDGET = 2048

function contextFor(agent: AgentDefinition, req: AgentRequest): McpContext {
  const writes = agent.id !== "researcher"
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

function observer(trace: TraceRecorder | undefined, parentId: string | undefined): ToolObserver | undefined {
  if (!trace) return undefined
  return {
    start: (name, input) => trace.begin({ label: name, title: toolTitle(name, input), kind: "tool", parentId }),
    end: (id, text) => { if (id) trace.end(id, summarizeResult(text)) },
  }
}

async function toolsFor(
  agent: AgentDefinition,
  req: AgentRequest,
  trace?: TraceRecorder,
  parentSpan?: string,
): Promise<Record<string, Tool>> {
  const all = await plannerTools()
  const ctx = contextFor(agent, req)
  const run = <T,>(fn: () => Promise<T>) => runWithMcpContext(ctx, fn) as Promise<T>
  const tools = toAiTools(all, toolsForRequest(agent, req.memory === true), run, observer(trace, parentSpan))
  if (agent.delegates.length) tools.delegate = delegateTool(agent, req, trace, parentSpan)
  return tools
}

function delegateTool(parent: AgentDefinition, req: AgentRequest, trace?: TraceRecorder, parentSpan?: string): Tool {
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
      if (!req.spend.budget.tryDelegate()) {
        return {
          agent: sub.name,
          answer: "Error: not delegated — this request has used its delegate calls or its usage budget. Answer from what you already have.",
          toolsUsed: [],
        }
      }
      const span = trace?.begin({ label: sub.id, title: `Asking the ${sub.name}`, kind: "agent", parentId: parentSpan })
      try {
        const result = await generateText({
          model: anthropic(sub.model),
          system: sub.instructions + contextBlock(req),
          prompt: task,
          tools: await toolsFor(sub, req, trace, span),
          stopWhen: stopFor(sub.maxSteps, req),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          onStepFinish: meterStep(req),
        })
        const toolsUsed = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))
        if (span) trace!.end(span, { status: "ok", detail: `${toolsUsed.length} tool${toolsUsed.length === 1 ? "" : "s"}`, tokens: result.totalUsage?.totalTokens })
        return {
          agent: sub.name,
          answer: result.text || "(the specialist finished without a written answer)",
          toolsUsed,
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        if (span) trace!.end(span, { status: "error", detail: `Failed: ${message.slice(0, 60)}` })
        return { agent: sub.name, answer: `Error: ${message}`, toolsUsed: [] }
      }
    },
  })
}

/**
 * Everything streamText needs for this agent. Pass a trace to record the run;
 * the caller opens the root span and passes its id, and closes it on finish.
 */
export async function prepareAgent(agent: AgentDefinition, req: AgentRequest, trace?: TraceRecorder, rootSpan?: string) {
  return {
    model: anthropic(agent.model),
    system: agent.instructions + contextBlock(req),
    tools: await toolsFor(agent, req, trace, rootSpan),
    stopWhen: stopFor(agent.maxSteps, req),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onStepFinish: meterStep(req),
    ...(req.thinking
      ? { providerOptions: { anthropic: { thinking: { type: "enabled" as const, budgetTokens: THINKING_BUDGET } } } }
      : {}),
  }
}
