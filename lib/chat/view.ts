/**
 * The chat's rules, with no React in them: what a message looks like on
 * screen, what is sent to /api/chat, how history is grouped, and what an
 * error says. Checked by view.assert.ts.
 */

import type { UIMessage } from "ai"
import { latestSpans, type AgentSpan } from "@/lib/agents/trace"
import { AGENTS, DEFAULT_AGENT_ID } from "@/lib/agents/catalog"

export type ChatMessage = UIMessage
export type { AgentSpan }

export const DEFAULT_AGENT: string = DEFAULT_AGENT_ID

export interface AgentChoice { id: string; name: string; description: string }

/** The agents a person may pick, in catalog order. `allowed` undefined means all. */
export function agentChoices(allowed?: string[]): AgentChoice[] {
  const all = AGENTS.map(({ id, name, description }) => ({ id, name, description }))
  return allowed ? all.filter((a) => allowed.includes(a.id)) : all
}

export type PartView = { kind: "text"; text: string } | { kind: "reasoning"; text: string }

export interface MessageView {
  id: string
  role: "user" | "assistant"
  parts: PartView[]
  /** The agent's steps for this reply (tool calls, hand-offs), newest state per step. */
  spans: AgentSpan[]
  /** All visible text, for copy and quote. */
  text: string
}

/** The model sometimes leaves this marker in its text; it is never shown. */
const clean = (t: string) => t.replace("<has_function_call>", "")

/** Turn stream messages into what the panel draws. Empty parts and system messages are dropped. */
export function toView(messages: ChatMessage[]): MessageView[] {
  const out: MessageView[] = []
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const parts: PartView[] = []
    for (const p of m.parts ?? []) {
      const text = "text" in p && typeof p.text === "string" ? clean(p.text) : ""
      if (!text) continue
      if (p.type === "text") parts.push({ kind: "text", text })
      else if (p.type === "reasoning" && m.role === "assistant") parts.push({ kind: "reasoning", text })
    }
    const spans = m.role === "assistant" ? latestSpans((m.parts ?? []) as { type?: string; id?: string; data?: unknown }[]) : []
    if (!parts.length && !spans.length) continue
    out.push({ id: m.id, role: m.role, parts, spans, text: parts.filter((p) => p.kind === "text").map((p) => p.text).join("\n") })
  }
  return out
}

export interface ScreenContext { path: string; title: string; units: { key: string; label: string }[] }

export interface SendOptions {
  id: string
  message: ChatMessage | undefined
  agentId: string
  projectId?: string | null
  /** What is on screen, sent only from the panel beside a page. */
  screen?: ScreenContext
  thinking: boolean
  memory: boolean
}

/** The body /api/chat expects. Only the newest message is sent; the server keeps the rest. */
export function chatBody(o: SendOptions): Record<string, unknown> {
  const context = { ...(o.projectId ? { projectId: o.projectId } : {}), ...(o.screen ? { screen: o.screen } : {}) }
  return {
    id: o.id,
    message: o.message,
    selectedChatModel: o.agentId,
    selectedVisibilityType: "private",
    ...(Object.keys(context).length ? { context } : {}),
    thinking: o.thinking,
    memory: o.memory,
  }
}

/** What to tell the person when a request fails. The server's own words win (usage limits say when they reset). */
export function errorText(status: number, body: { error?: unknown } | null, online = true): string {
  if (!online) return "You're offline. Check your connection and send it again."
  if (body && typeof body.error === "string" && body.error) return body.error
  if (status === 401) return "You need to sign in again."
  if (status === 403) return "Your account can't use this."
  if (status === 429) return "You've reached today's message limit. Try again later."
  return "The assistant couldn't answer. Try again."
}

export interface ChatSummary { id: string; title: string; createdAt: string }

const DAY = 86_400_000

/** History groups, newest first: Today, Yesterday, This week, Older. Empty groups are left out. */
export function groupChats(chats: ChatSummary[], now: Date): [string, ChatSummary[]][] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups: Record<string, ChatSummary[]> = { Today: [], Yesterday: [], "This week": [], Older: [] }
  for (const c of chats) {
    const t = new Date(c.createdAt).getTime()
    const label = t >= start ? "Today" : t >= start - DAY ? "Yesterday" : t >= start - 7 * DAY ? "This week" : "Older"
    groups[label].push(c)
  }
  return Object.entries(groups).filter(([, list]) => list.length > 0)
}

export function newChatId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Starters for an empty chat. `tour` runs the walkthrough instead of sending text. */
export const STARTERS: { label: string; hint: string; tour?: boolean }[] = [
  { label: "Catch me up on my shared projects", hint: "What changed and what needs you" },
  { label: "What do I need to do next?", hint: "Your todos and open steps" },
  { label: "What changed since I was last here?", hint: "New activity across projects" },
  { label: "Show me around the planner", hint: "A short walkthrough", tour: true },
]

/**
 * The composer's "+" menu, the same list as BYB's admin assistant: add files,
 * then Skills, Connectors and Memory. Here Memory already works (it is a
 * switch); the rest are shown as coming, not usable. `canAttach` is false
 * until the planner has somewhere to upload a chat file to.
 */
export type PlusItemId = "files" | "skills" | "connectors" | "memory" | "reasoning"
export interface PlusItem { id: PlusItemId; label: string; hint?: string; soon: boolean; group: "add" | "more"; on?: boolean }
export const SOON_LABEL = "Soon"

export function plusItems(o: { canAttach: boolean; memory: boolean; reasoning: boolean }): PlusItem[] {
  return [
    { id: "files", label: "Add files or photos", soon: !o.canAttach, group: "add" },
    { id: "skills", label: "Skills", soon: true, group: "more" },
    { id: "connectors", label: "Connectors", soon: true, group: "more" },
    { id: "memory", label: "Memory", hint: "Search your past chats and memory", soon: false, group: "more", on: o.memory },
    { id: "reasoning", label: "Show reasoning", hint: "See how it thought it through (slower)", soon: false, group: "more", on: o.reasoning },
  ]
}
