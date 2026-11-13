"use client"

/*
 * The one place the chat talks to the AI. It owns the stream (/api/chat), the
 * draft, the agent choice and the Think / Memory switches, and hands the
 * panel a plain model to draw. The panel never fetches or streams.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { toast } from "sonner"
import { scanUnits } from "@/lib/ade/ui/scan"
import { briefingLine } from "@/lib/ade/briefing"
import { ASK_EVENT, QUOTE_EVENT, asQuote, type TextDetail } from "@/lib/chat/events"
import { deriveStatus, type ThreadStatus } from "@/lib/chat/threads"
import { agentChoices, chatBody, errorText, newChatId, toView, type AgentChoice, type ChatMessage, type MessageView } from "@/lib/chat/view"

export const HISTORY_CHANGED_EVENT = "chat:history-changed"

const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const DRAFT = "chat-draft", THINK = "chat-thinking", MEMORY = "chat-memory"

/** A switch remembered per browser. Starts off, then reads the saved value (no server/browser mismatch). */
function useRemembered(key: string): [boolean, () => void] {
  const [on, setOn] = useState(false)
  useEffect(() => { setOn(read(key) === "true") }, [key])
  const toggle = useCallback(() => setOn((v) => { write(key, String(!v)); return !v }), [key])
  return [on, toggle]
}

export interface ChatModel {
  messages: MessageView[]
  /** Waiting for the first words of a reply. */
  waiting: boolean
  /** A reply is on its way (waiting or streaming). */
  busy: boolean
  input: string
  setInput: (v: string | ((prev: string) => string)) => void
  send: (text?: string) => void
  stop: () => void
  agents: AgentChoice[]
  agentId: string
  setAgent: (id: string) => void
  thinking: boolean
  toggleThinking: () => void
  memory: boolean
  toggleMemory: () => void
  /** One line of real counts for the empty state, or null. */
  briefing: string | null
  inputRef: React.RefObject<HTMLTextAreaElement>
}

export interface AssistantChatOptions {
  id: string
  initialMessages?: ChatMessage[]
  initialAgent: string
  /** Agents this person may pick; undefined = all. */
  agentIds?: string[]
  projectId?: string | null
  /** In the panel beside a page: send what is on screen with each message. */
  docked?: boolean
  /** Called when the person sends (the chat page uses it to put the chat id in the address). */
  onSend?: () => void
  /** False for a chat open in a background tab: it keeps streaming but leaves the shared draft and page events alone. */
  active?: boolean
  /** Reports what this chat is doing, and the first thing asked (a tab's status and name). */
  onStatus?: (status: ThreadStatus, firstAsk?: string) => void
}

export function useAssistantChat(o: AssistantChatOptions): ChatModel {
  const agents = useMemo(() => agentChoices(o.agentIds), [o.agentIds])
  const [agentId, setAgent] = useState(o.initialAgent)
  const [thinking, toggleThinking] = useRemembered(THINK)
  const [memory, toggleMemory] = useRemembered(MEMORY)
  const [input, setInputState] = useState("")
  const [briefing, setBriefing] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // The transport is built once; it reads the latest choices through this ref.
  const live = useRef({ agentId, thinking, memory, projectId: o.projectId, docked: o.docked })
  live.current = { agentId, thinking, memory, projectId: o.projectId, docked: o.docked }

  const transport = useMemo(() => new DefaultChatTransport<ChatMessage>({
    api: "/api/chat",
    fetch: async (input, init) => {
      let res: Response
      try { res = await fetch(input, init) } catch (e) {
        throw new Error(errorText(0, null, typeof navigator === "undefined" || navigator.onLine), { cause: e })
      }
      if (!res.ok) throw new Error(errorText(res.status, await res.json().catch(() => null)))
      return res
    },
    prepareSendMessagesRequest(request) {
      const c = live.current
      const screen = c.docked
        ? { path: location.pathname + location.search, title: document.title, units: scanUnits(document, 80).map((u) => ({ key: u.key, label: u.label })) }
        : undefined
      return {
        body: {
          ...chatBody({ id: request.id, message: request.messages.at(-1), agentId: c.agentId, projectId: c.projectId, screen, thinking: c.thinking, memory: c.memory }),
          ...request.body,
        },
      }
    },
  }), [])

  const { messages, sendMessage, status, stop } = useChat<ChatMessage>({
    id: o.id,
    messages: o.initialMessages ?? [],
    experimental_throttle: 100,
    generateId: newChatId,
    transport,
    onFinish: () => window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT)),
    onError: (error) => toast.error(error.message || errorText(500, null)),
  })

  const busy = status === "submitted" || status === "streaming"
  // Closing a tab or leaving the page stops a reply that is still coming.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => () => { void stopRef.current() }, [])
  const active = o.active !== false
  const activeRef = useRef(active)
  activeRef.current = active

  const firstAsk = useMemo(() => {
    const first = messages.find((m) => m.role === "user")
    const part = first?.parts?.find((p) => p.type === "text")
    return part && "text" in part ? part.text : undefined
  }, [messages])
  const onStatus = o.onStatus
  const threadStatus = deriveStatus(status, messages.length)
  useEffect(() => { onStatus?.(threadStatus, firstAsk) }, [onStatus, threadStatus, firstAsk])

  // Draft: kept per browser so a half-written message survives a page change.
  useEffect(() => { const saved = activeRef.current ? read(DRAFT) : null; if (saved) setInputState(saved) }, [])
  const setInput = useCallback((v: string | ((prev: string) => string)) => {
    setInputState((prev) => { const next = typeof v === "function" ? v(prev) : v; if (activeRef.current) write(DRAFT, next); return next })
  }, [])

  // Long-press menus and swipes hand text to the composer through window events.
  useEffect(() => {
    const text = (e: Event) => (e as CustomEvent<TextDetail>).detail?.text
    const onQuote = (e: Event) => { const t = text(e); if (t && activeRef.current) { setInput((prev) => asQuote(t) + prev); inputRef.current?.focus() } }
    const onAsk = (e: Event) => { const t = text(e); if (t && activeRef.current) { setInput(t); inputRef.current?.focus() } }
    window.addEventListener(QUOTE_EVENT, onQuote)
    window.addEventListener(ASK_EVENT, onAsk)
    return () => { window.removeEventListener(QUOTE_EVENT, onQuote); window.removeEventListener(ASK_EVENT, onAsk) }
  }, [setInput])

  useEffect(() => {
    let off = false
    fetch("/api/ade/briefing", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!off) setBriefing(briefingLine(j)) })
      .catch(() => {})
    return () => { off = true }
  }, [])

  const onSend = o.onSend
  const send = useCallback((text?: string) => {
    const body = (text ?? input).trim()
    if (!body) return
    if (busy) { toast.error("Wait for the reply to finish, or stop it."); return }
    onSend?.()
    sendMessage({ text: body })
    if (text === undefined) setInput("")
  }, [input, busy, onSend, sendMessage, setInput])

  const view = useMemo(() => toView(messages), [messages])

  return {
    messages: view,
    waiting: status === "submitted",
    busy,
    input, setInput, send,
    stop: () => { void stop() },
    agents, agentId, setAgent,
    thinking, toggleThinking, memory, toggleMemory,
    briefing,
    inputRef,
  }
}
