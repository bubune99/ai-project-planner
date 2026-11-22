/*
 * A model that costs nothing: it plays back scripted replies, and counts how
 * often it was asked and how much it was sent each time. No network, no key.
 *
 * It speaks the AI SDK's model interface (both the streaming call the chat
 * route makes and the one-shot call a delegated specialist makes), so the
 * planner's real turn loop runs against it unchanged.
 *
 * Pure: no imports that run, no clock, no randomness. Checked by
 * lib/agents/cost-kit/cost-kit.assert.ts.
 */

import type { LanguageModel } from "ai"

type Model = Exclude<LanguageModel, string>
type CallOptions = Parameters<Model["doGenerate"]>[0]
type Generated = Awaited<ReturnType<Model["doGenerate"]>>
type Streamed = Awaited<ReturnType<Model["doStream"]>>
type StreamPart = Streamed["stream"] extends ReadableStream<infer P> ? P : never

/** One scripted model reply: tool calls (a tool round), or text alone (the answer). */
export interface Reply {
  text?: string
  tools?: { name: string; input?: Record<string, unknown> }[]
}

/** What one call to the model was sent. */
export interface ModelCall {
  /** 1-based, across every agent in the turn. */
  n: number
  /** Which script answered it (the agent, as `who` named it). */
  who: string
  mode: "stream" | "generate"
  modelId: string
  /** Messages in the prompt, the system message included. */
  messages: number
  /** Characters of everything sent: the prompt and the tool definitions. */
  charsSent: number
  /** The same as an estimate in tokens (characters / 4, rounded up). */
  tokensSent: number
  /** Every tool result in the prompt, by tool call id, in order (a repeat shows twice). */
  toolResultIds: string[]
  /** The text and tool calls it replied with. */
  reply: Reply
}

/** Tokens for a piece of text, the same rough way everywhere in the kit. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4)

export interface FakeModelOptions {
  /** Replies per agent, in the order that agent asks. */
  scripts: Record<string, Reply[]>
  /** Names the agent a call belongs to, from its system prompt. */
  who: (system: string) => string
}

export interface FakeModel {
  /** The model for a model id: what the runtime's `model` seam takes. */
  forId: (modelId: string) => Model
  calls: ModelCall[]
  /** Calls the script had no reply for. A run with any of these is over its count. */
  overruns: string[]
}

export class ScriptExhausted extends Error {
  constructor(who: string, asked: number, held: number) {
    super(`cost kit: ${who} asked the model ${asked} times; its script holds ${held}`)
    this.name = "ScriptExhausted"
  }
}

function systemOf(prompt: CallOptions["prompt"]): string {
  return prompt.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n")
}

function toolResultIdsOf(prompt: CallOptions["prompt"]): string[] {
  const ids: string[] = []
  for (const m of prompt) {
    if (m.role !== "tool") continue
    for (const part of m.content) if (part.type === "tool-result") ids.push(part.toolCallId)
  }
  return ids
}

export function fakeModel(opts: FakeModelOptions): FakeModel {
  const calls: ModelCall[] = []
  const overruns: string[] = []
  const asked: Record<string, number> = {}

  /** Records the call and returns the next scripted reply for its agent. */
  function next(options: CallOptions, mode: ModelCall["mode"], modelId: string) {
    const who = opts.who(systemOf(options.prompt))
    const script = opts.scripts[who] ?? []
    const index = asked[who] ?? 0
    asked[who] = index + 1
    const charsSent = JSON.stringify(options.prompt).length + JSON.stringify(options.tools ?? []).length
    const reply = script[index]
    if (!reply) {
      const fault = new ScriptExhausted(who, index + 1, script.length)
      overruns.push(fault.message)
      throw fault
    }
    const n = calls.length + 1
    calls.push({
      n, who, mode, modelId,
      messages: options.prompt.length,
      charsSent,
      tokensSent: estimateTokens(charsSent),
      toolResultIds: toolResultIdsOf(options.prompt),
      reply,
    })
    const toolCalls = (reply.tools ?? []).map((t, i) => ({
      type: "tool-call" as const,
      toolCallId: `call-${n}-${i + 1}`,
      toolName: t.name,
      input: JSON.stringify(t.input ?? {}),
    }))
    const outChars = (reply.text ?? "").length + toolCalls.reduce((sum, c) => sum + c.toolName.length + c.input.length, 0)
    const inputTokens = estimateTokens(charsSent)
    const outputTokens = estimateTokens(outChars)
    return {
      n,
      text: reply.text ?? "",
      toolCalls,
      finishReason: toolCalls.length ? ("tool-calls" as const) : ("stop" as const),
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    }
  }

  function forId(modelId: string): Model {
    return {
      specificationVersion: "v2",
      provider: "cost-kit-fake",
      modelId,
      supportedUrls: {},
      doGenerate: async (options): Promise<Generated> => {
        const r = next(options, "generate", modelId)
        return {
          content: [...(r.text ? [{ type: "text" as const, text: r.text }] : []), ...r.toolCalls],
          finishReason: r.finishReason,
          usage: r.usage,
          warnings: [],
        }
      },
      doStream: async (options): Promise<Streamed> => {
        const r = next(options, "stream", modelId)
        const id = `text-${r.n}`
        // Text arrives in small pieces, the way a real stream delivers it.
        const pieces = r.text.match(/[\s\S]{1,6}/g) ?? []
        const parts: StreamPart[] = [
          { type: "stream-start", warnings: [] },
          ...(pieces.length
            ? [
                { type: "text-start" as const, id },
                ...pieces.map((delta) => ({ type: "text-delta" as const, id, delta })),
                { type: "text-end" as const, id },
              ]
            : []),
          ...r.toolCalls,
          { type: "finish", finishReason: r.finishReason, usage: r.usage },
        ]
        return {
          stream: new ReadableStream<StreamPart>({
            start(controller) {
              for (const part of parts) controller.enqueue(part)
              controller.close()
            },
          }),
        }
      },
    }
  }

  return { forId, calls, overruns }
}
