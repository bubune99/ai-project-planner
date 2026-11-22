/*
 * Runs one chat turn of an in-app agent the way app/api/chat/route.ts does
 * (admission, then prepareAgent, then streamText over what it returns), against
 * the fake model, and reports what the turn cost in model calls.
 *
 * Nothing real is reachable while it runs:
 *  - fetch is replaced: any request is recorded and refused (RealModelReached);
 *  - the Anthropic key in this process is overwritten with a placeholder;
 *  - the database module is replaced: any query is recorded and refused;
 *  - the planner's tools are replaced by stand-ins with the same names that
 *    return a short fixed text (the kit measures the turn loop, not the tools).
 *
 * What is real: the agents' definitions and instructions (registry.ts), the
 * runtime (prepareAgent: step cap, budget stop, metering, the delegate tool),
 * the admission rule and budget (lib/ai/spend-limits.ts) and the AI SDK loop.
 *
 * Test-only. Never import this from the app.
 */

import { streamText } from "ai"
import { AGENTS, type AgentId } from "../catalog"
import { REGISTRY, MEMORY_TOOLS } from "../registry"
import { decideAdmission, readSpendLimits, RunBudget, type SpendLimits, type WindowUsage } from "../../ai/spend-limits"
import { fakeModel, type ModelCall, type Reply } from "./fake-model"

export class RealModelReached extends Error {
  constructor(what: string) {
    super(`cost kit: something real was reached (${what}). No message may leave a cost-kit run.`)
    this.name = "RealModelReached"
  }
}

/** Everything that tried to leave the process, or reach the database, since install. */
export const reached: { network: string[]; database: string[] } = { network: [], database: [] }

const stubs: { toolsRun: string[]; toolResult: (name: string) => string } = {
  toolsRun: [],
  toolResult: (name) => `${name}: ok`,
}

let installed = false

/** Replace the network, the key, the database and the planner tools. Idempotent. */
export function install(): void {
  if (installed) return
  installed = true

  process.env.ANTHROPIC_API_KEY = "cost-kit-not-a-key"
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String((input as { url?: string })?.url ?? input)
    reached.network.push(url)
    throw new RealModelReached(`fetch ${url}`)
  }) as typeof fetch

  const replace = (path: string, exports: unknown) => {
    require.cache[path] = { id: path, filename: path, loaded: true, exports, children: [], paths: [] } as unknown as NodeJS.Module
  }
  const sql = (strings: TemplateStringsArray | string) => {
    const text = (Array.isArray(strings) ? (strings as readonly string[]).join("?") : String(strings)).replace(/\s+/g, " ").trim()
    reached.database.push(text)
    throw new RealModelReached(`database: ${text.slice(0, 60)}`)
  }
  replace(require.resolve("../../db/client"), { sql, pool: {} })

  // Every tool name an agent may be offered, as a stand-in that only answers.
  const names = [...new Set([...AGENTS.flatMap((a) => REGISTRY[a.id].tools), ...MEMORY_TOOLS])]
  replace(require.resolve("../../mcp/planner-tools"), {
    registerPlannerTools: (server: { tool: (name: string, description: string, shape: object, handler: () => unknown) => void }) => {
      for (const name of names) {
        server.tool(name, `Stand-in for ${name}.`, {}, () => {
          stubs.toolsRun.push(name)
          return { content: [{ type: "text", text: stubs.toolResult(name) }] }
        })
      }
    },
  })
}

const whoIs = (system: string): string => AGENTS.find((a) => system.startsWith(REGISTRY[a.id].instructions))?.id ?? "unknown"

export interface TurnInput {
  agent: AgentId
  /** Scripted model replies per agent id (the main agent, and any specialist it hands to). */
  scripts: Partial<Record<AgentId, Reply[]>>
  question?: string
  /** Spend settings as the route reads them from env (AI_DISABLED, AI_USER_TOKEN_LIMIT, AI_REQUEST_TOKEN_LIMIT, ...). */
  env?: Record<string, string>
  /** Tokens already used in the window. null: usage could not be read. */
  usage?: WindowUsage | null
  /** Recording usage fails (the usage store is down). */
  recordFails?: boolean
  toolResult?: (name: string) => string
  /** Leave the model seam empty, so the runtime builds the real client. For the guard check only. */
  realModel?: boolean
}

export interface TurnReport {
  admitted: boolean
  /** Why admission refused, when it did. */
  refusal?: string
  calls: ModelCall[]
  /** Model calls per agent id. */
  callsBy: Record<string, number>
  toolsRun: string[]
  /** All text streamed to the person during the turn, in order. */
  shown: string
  /** What the route saves as the reply: the text of the last model call. */
  answer: string
  /** Tokens the request budget counted, and what was written to the usage store per step. */
  metered: number
  recorded: number[]
  delegatesUsed: number
}

/** A fixed moment, so admission wording and windows never depend on the clock. */
const NOW = Date.parse("2026-11-22T12:00:00Z")

export async function runTurn(input: TurnInput): Promise<TurnReport> {
  install()
  const networkBefore = reached.network.length
  const databaseBefore = reached.database.length
  stubs.toolsRun = []
  stubs.toolResult = input.toolResult ?? ((name) => `${name}: ok`)

  const model = fakeModel({ scripts: input.scripts as Record<string, Reply[]>, who: whoIs })
  const report: TurnReport = {
    admitted: false, calls: model.calls, callsBy: {}, toolsRun: stubs.toolsRun,
    shown: "", answer: "", metered: 0, recorded: [], delegatesUsed: 0,
  }

  // The route's first gate: no model is built, let alone called, when it refuses.
  const limits: SpendLimits = readSpendLimits(input.env ?? {})
  const usage = input.usage === undefined ? { user: 0, global: 0 } : input.usage
  const admission = decideAdmission(limits, usage, NOW)
  if (!admission.ok) return { ...report, refusal: admission.code }
  report.admitted = true

  const { prepareAgent } = await import("../runtime")
  const budget = new RunBudget(limits.perRequest)
  const prepared = await prepareAgent(REGISTRY[input.agent], {
    userId: "cost-kit-user",
    projectId: null,
    today: "2026-11-22",
    spend: {
      budget,
      record: async (tokens) => { report.recorded.push(tokens); return !input.recordFails },
    },
    ...(input.realModel ? {} : { model: model.forId }),
  })

  let failure: unknown
  const result = streamText({
    ...prepared,
    messages: [{ role: "user", content: input.question ?? "How many projects do I have?" }],
    onError: ({ error }) => { failure = error },
  })
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") report.shown += part.text
  }

  if (reached.network.length > networkBefore) throw new RealModelReached(reached.network.slice(networkBefore).join(", "))
  if (reached.database.length > databaseBefore) throw new RealModelReached(`database: ${reached.database[databaseBefore]}`)
  if (model.overruns.length) throw new Error(model.overruns.join("; "))
  if (failure) throw failure

  report.answer = await result.text
  report.metered = budget.tokens
  report.delegatesUsed = budget.delegateCalls
  for (const c of model.calls) report.callsBy[c.who] = (report.callsBy[c.who] ?? 0) + 1
  return report
}
