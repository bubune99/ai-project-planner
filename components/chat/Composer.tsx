"use client"

/* The message box. Draws the model it is given; knows nothing about the stream. */

import { useEffect, useRef, useState } from "react"
import { ArrowUp, BookOpenText, Brain, Check, ChevronDown, Square } from "lucide-react"
import { HoldToTalk } from "./HoldToTalk"
import type { ChatModel } from "./useAssistantChat"

const MAX_HEIGHT = 200

function AgentPicker({ model }: { model: ChatModel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = model.agents.find((a) => a.id === model.agentId) ?? model.agents[0]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", key)
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key) }
  }, [open])

  if (!current) return null
  // One agent: a plain label, nothing to pick.
  if (model.agents.length <= 1) return <span className="opx-chat-tool opx-chat-agent" data-ui="chat.agent">{current.name}</span>

  return (
    <div ref={ref} className="opx-chat-pick">
      <button type="button" className="opx-chat-tool opx-chat-agent" data-ui="chat.agent" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{current.name}</span><ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className="opx-chat-menu" role="listbox" aria-label="Choose an agent">
          {model.agents.map((a) => (
            <button key={a.id} type="button" role="option" aria-selected={a.id === model.agentId} onClick={() => { model.setAgent(a.id); setOpen(false) }}>
              <span><b>{a.name}</b><small>{a.description}</small></span>
              {a.id === model.agentId && <Check size={15} strokeWidth={2.2} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Composer({ model, compact }: { model: ChatModel; compact?: boolean }) {
  const ta = model.inputRef

  // Grow with the text, up to a limit; then it scrolls.
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`
  }, [model.input, ta])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
    // On touch keyboards Enter makes a new line; the send button sends.
    if (window.matchMedia("(pointer: coarse)").matches) return
    e.preventDefault()
    model.send()
  }

  const toggle = (on: boolean, flip: () => void, ui: string, label: string, onTitle: string, offTitle: string, icon: React.ReactNode) => (
    <button type="button" data-ui={ui} className={`opx-chat-tool${on ? " on" : ""}`} aria-pressed={on} aria-label={label} title={on ? onTitle : offTitle} onClick={flip}>
      {icon}{!compact && <span>{label}</span>}
    </button>
  )

  return (
    <form className="opx-chat-composer" data-ui="chat.composer" onSubmit={(e) => { e.preventDefault(); model.send() }}>
      <textarea
        ref={ta}
        rows={1}
        value={model.input}
        onChange={(e) => model.setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about your projects, or plan something…"
        aria-label="Message the assistant"
      />
      <div className="opx-chat-tools">
        <AgentPicker model={model} />
        {toggle(model.thinking, model.toggleThinking, "chat.think", "Think", "Thinking on: the agent shows its reasoning (slower)", "Show the agent's reasoning on the next message", <Brain size={16} strokeWidth={1.9} aria-hidden />)}
        {toggle(model.memory, model.toggleMemory, "chat.memory", "Memory", "Memory on: the agent can search your past chats and memory", "Let the agent search your past chats and memory", <BookOpenText size={16} strokeWidth={1.9} aria-hidden />)}
        <span className="opx-chat-end">
          <HoldToTalk disabled={model.busy} onText={(t) => model.setInput((prev) => (prev ? `${prev} ${t}` : t))} />
          {model.busy ? (
            <button type="button" className="opx-chat-send" data-ui="chat.stop" aria-label="Stop" title="Stop" onClick={model.stop}><Square size={13} strokeWidth={0} fill="currentColor" aria-hidden /></button>
          ) : (
            <button type="submit" className="opx-chat-send" data-ui="chat.send" aria-label="Send" title="Send" disabled={!model.input.trim() || model.busy}><ArrowUp size={17} strokeWidth={2.2} aria-hidden /></button>
          )}
        </span>
      </div>
    </form>
  )
}
