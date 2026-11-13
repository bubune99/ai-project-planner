"use client"

/*
 * The chat itself: messages (or the empty state) and the composer. Display
 * only: everything it shows and does comes from the model (useAssistantChat).
 * `compact` is the narrow panel beside a page; without it, the full page.
 */

import { useEffect, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"
import { startTour } from "@/lib/ade/ui/attention-events"
import { STARTERS } from "@/lib/chat/view"
import { Composer } from "./Composer"
import { MessageView } from "./MessageView"
import type { ChatModel } from "./useAssistantChat"

function EmptyState({ model, compact }: { model: ChatModel; compact?: boolean }) {
  return (
    <div className="opx-chat-empty">
      <h2>How can I help?</h2>
      <p>{model.briefing ?? "Ask about any project, or tell me what to plan."}</p>
      <div className={`opx-chat-starters${compact ? "" : " wide"}`} data-testid="suggested-actions">
        {STARTERS.map((s, i) => (
          <button key={s.label} type="button" data-ui={`chat.starter.${i}`} onClick={() => (s.tour ? startTour() : model.send(s.label))}>
            <b>{s.label}</b><small>{s.hint}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel({ model, compact }: { model: ChatModel; compact?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  // Follow new text only while the person is at the bottom; scrolling up to read stops it.
  const follow = useRef(true)
  const [away, setAway] = useState(false)

  const toBottom = (smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }
  useEffect(() => { if (follow.current) toBottom() }, [model.messages, model.waiting])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    follow.current = atBottom
    setAway(!atBottom)
  }

  const send: ChatModel["send"] = (text) => { follow.current = true; model.send(text) }
  const bound = { ...model, send }
  const empty = model.messages.length === 0 && !model.waiting
  const last = model.messages.at(-1)

  return (
    <div className={`opx-chat${compact ? " compact" : ""}${empty ? " is-empty" : ""}`}>
      <div className="opx-chat-scroll" ref={scroller} onScroll={onScroll}>
        <div className="opx-chat-col">
          {empty ? <EmptyState model={bound} compact={compact} /> : (
            <>
              {model.messages.map((m) => <MessageView key={m.id} message={m} live={model.busy && m === last && m.role === "assistant"} />)}
              {model.waiting && <div className="opx-chat-wait" role="status"><i /><i /><i /><span>Thinking</span></div>}
            </>
          )}
        </div>
        {away && !empty && (
          <button type="button" className="opx-chat-jump" aria-label="Jump to the latest message" onClick={() => { follow.current = true; toBottom(true) }}><ArrowDown size={16} strokeWidth={2} aria-hidden /></button>
        )}
      </div>
      <div className="opx-chat-foot"><div className="opx-chat-col"><Composer model={bound} compact={compact} /></div></div>
    </div>
  )
}
