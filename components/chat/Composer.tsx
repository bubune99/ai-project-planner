"use client"

/*
 * The message box, laid out like BYB's admin assistant: one row with the
 * text, then "+", the mic and send. Everything else lives in the "+" menu
 * (who you are talking to, memory, reasoning). Anything switched on shows as
 * a small chip above the text, so nothing is on without being seen.
 * Draws the model it is given; knows nothing about the stream.
 */

import { useEffect, useRef, useState } from "react"
import { ArrowUp, BookMarked, Check, Lightbulb, Paperclip, Plug, Plus, Wrench, X } from "lucide-react"
import { SOON_LABEL, plusItems, type PlusItemId } from "@/lib/chat/view"
import { HoldToTalk } from "./HoldToTalk"
import type { ChatModel } from "./useAssistantChat"

const MAX_HEIGHT = 160
const ICON = { size: 16, strokeWidth: 1.9, "aria-hidden": true } as const

function ItemIcon({ id }: { id: PlusItemId }) {
  if (id === "files") return <Paperclip {...ICON} />
  if (id === "skills") return <Wrench {...ICON} />
  if (id === "connectors") return <Plug {...ICON} />
  if (id === "memory") return <BookMarked {...ICON} />
  return <Lightbulb {...ICON} />
}

function PlusMenu({ model }: { model: ChatModel }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const items = plusItems({ canAttach: false, memory: model.memory, reasoning: model.thinking })

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", key)
    // The first usable row takes focus, so the keyboard can carry on.
    wrap.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not([disabled])')?.focus()
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key) }
  }, [open])

  const run = (id: PlusItemId) => {
    if (id === "memory") model.toggleMemory()
    else if (id === "reasoning") model.toggleThinking()
  }

  return (
    <span ref={wrap} className="opx-plus">
      <button type="button" className="opx-chat-ib" data-ui="chat.plus" aria-label="Add" title="Add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Plus size={18} strokeWidth={1.9} aria-hidden /></button>
      {open && (
        <div role="menu" aria-label="Add to your message" className="opx-plus-menu">
          {items.map((item, i) => (
            <div key={item.id}>
              {i > 0 && items[i - 1].group !== item.group && <div role="separator" className="opx-plus-sep" />}
              <button type="button" role={item.on === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.on} disabled={item.soon} title={item.hint} onClick={() => run(item.id)} data-ui={`chat.plus.${item.id}`}>
                <ItemIcon id={item.id} />
                <span>{item.label}</span>
                {item.soon ? <em>{SOON_LABEL}</em> : item.on ? <Check size={15} strokeWidth={2.2} aria-hidden style={{ marginLeft: "auto", opacity: 1 }} /> : null}
              </button>
            </div>
          ))}
          {model.agents.length > 1 && (
            <>
              <div role="separator" className="opx-plus-sep" />
              <div className="opx-plus-label" id="opx-plus-agents">Talking to</div>
              <div role="group" aria-labelledby="opx-plus-agents">
                {model.agents.map((a) => (
                  <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === model.agentId} title={a.description} onClick={() => { model.setAgent(a.id); setOpen(false) }} data-ui={`chat.plus.agent.${a.id}`}>
                    <span className="opx-plus-dot" aria-hidden />
                    <span>{a.name}</span>
                    {a.id === model.agentId && <Check size={15} strokeWidth={2.2} aria-hidden style={{ marginLeft: "auto", opacity: 1 }} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  )
}

/** What is switched on, as chips above the text. Each can be turned off from the chip. */
function Chips({ model }: { model: ChatModel }) {
  const agent = model.agents.find((a) => a.id === model.agentId)
  const other = agent && model.agents.length > 1 && agent.id !== model.agents[0]?.id ? agent : null
  if (!other && !model.memory && !model.thinking) return null
  const chip = (label: string, title: string, off: () => void) => (
    <span className="opx-chat-chip" title={title}>{label}<button type="button" aria-label={`Turn off: ${label}`} onClick={off}><X size={13} strokeWidth={2} aria-hidden /></button></span>
  )
  return (
    <div className="opx-chat-chips">
      {other && chip(other.name, other.description, () => model.setAgent(model.agents[0].id))}
      {model.memory && chip("Memory", "It can search your past chats and memory", model.toggleMemory)}
      {model.thinking && chip("Reasoning", "It shows how it thought it through (slower)", model.toggleThinking)}
    </div>
  )
}

export function Composer({ model }: { model: ChatModel; compact?: boolean }) {
  const ta = model.inputRef

  // One row when empty; grows with the text up to a limit, then scrolls.
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
  }, [model.input, ta])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
    // On touch keyboards Enter makes a new line; the send button sends.
    if (window.matchMedia("(pointer: coarse)").matches) return
    e.preventDefault()
    model.send()
  }

  return (
    <form className="opx-chat-composer" data-ui="chat.composer" onSubmit={(e) => { e.preventDefault(); model.send() }}>
      <Chips model={model} />
      <div className="opx-chat-row">
        <textarea
          ref={ta}
          rows={1}
          value={model.input}
          onChange={(e) => model.setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything, or plan something"
          aria-label="Message the assistant"
        />
        <div className="opx-chat-tools">
          <PlusMenu model={model} />
          <HoldToTalk disabled={model.busy} onText={(t) => model.setInput((prev) => (prev ? `${prev} ${t}` : t))} />
          {model.busy ? (
            <button type="button" className="opx-chat-send" data-ui="chat.stop" aria-label="Stop" title="Stop" onClick={model.stop}><span className="opx-chat-stop" aria-hidden /></button>
          ) : (
            <button type="submit" className="opx-chat-send" data-ui="chat.send" aria-label="Send" title="Send" disabled={!model.input.trim()}><ArrowUp size={18} strokeWidth={2} aria-hidden /></button>
          )}
        </div>
      </div>
    </form>
  )
}
