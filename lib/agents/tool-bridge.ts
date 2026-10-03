/*
 * Turns the planner's MCP tools into AI SDK tools for the in-app agents.
 *
 * registerPlannerTools(server) only ever calls server.tool(name, description,
 * zodShape, handler). collectTools() hands it a recorder with that one method
 * and keeps what it registers. toAiTools() wraps each allowlisted tool for
 * streamText, running the original handler inside runWithMcpContext so the
 * tool sees the signed-in user exactly as it would see an API-key caller.
 *
 * Dependencies (the register function, the context runner) are injected so
 * lib/agents/tool-bridge.assert.ts can exercise the mapping without a DB.
 */

import { tool, type Tool } from "ai"
import { z, type ZodRawShape } from "zod"

export interface CollectedTool {
  name: string
  description: string
  shape: ZodRawShape
  handler: (args: Record<string, unknown>, extra: unknown) => unknown | Promise<unknown>
}

type Register = (server: any) => Promise<void> | void

export async function collectTools(register: Register): Promise<Map<string, CollectedTool>> {
  const tools = new Map<string, CollectedTool>()
  const recorder = {
    tool: (name: string, ...rest: unknown[]) => {
      const handler = rest[rest.length - 1]
      if (typeof handler !== "function") throw new Error(`tool ${name}: no handler`)
      const description = rest.find((r) => typeof r === "string") as string | undefined
      const shape = rest.find((r) => r && typeof r === "object" && typeof r !== "function") as ZodRawShape | undefined
      if (tools.has(name)) throw new Error(`tool ${name} registered twice`)
      tools.set(name, { name, description: description ?? name, shape: shape ?? {}, handler: handler as CollectedTool["handler"] })
    },
  }
  await register(recorder)
  return tools
}

/** MCP tool results are { content: [{ type: "text", text }], isError? }. Flatten for the model. */
export function resultText(result: unknown): { text: string; isError: boolean } {
  const r = result as { content?: { type?: string; text?: string }[]; isError?: boolean } | null
  if (!r || !Array.isArray(r.content)) return { text: typeof result === "string" ? result : JSON.stringify(result ?? null), isError: false }
  const text = r.content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n")
  return { text, isError: r.isError === true }
}

/** Optional hooks for tracing: called around every tool call. */
export interface ToolObserver {
  start: (name: string, input: Record<string, unknown>) => string | undefined
  end: (id: string | undefined, resultText: string) => void
}

export function toAiTools(
  collected: Map<string, CollectedTool>,
  allow: readonly string[],
  runInContext: <T>(fn: () => Promise<T>) => Promise<T>,
  observe?: ToolObserver,
): Record<string, Tool> {
  const out: Record<string, Tool> = {}
  for (const name of allow) {
    const t = collected.get(name)
    if (!t) throw new Error(`agent allowlists unknown tool "${name}"`)
    out[name] = tool({
      description: t.description,
      inputSchema: z.object(t.shape),
      execute: async (input: Record<string, unknown>) => {
        const spanId = observe?.start(name, input)
        let out: string
        try {
          const raw = await runInContext(async () => t.handler(input, {}))
          const { text, isError } = resultText(raw)
          out = isError ? `Error: ${text}` : text
        } catch (e: unknown) {
          out = `Error: ${e instanceof Error ? e.message : String(e)}`
        }
        observe?.end(spanId, out)
        return out
      },
    })
  }
  return out
}

