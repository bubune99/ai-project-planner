"use client"

/* One message: a person's bubble, or the assistant's steps, reasoning and text. */

import { memo, useRef } from "react"
import { Copy } from "lucide-react"
import { Streamdown } from "streamdown"
import { toast } from "sonner"
import { AgentActivity } from "@/components/agents/AgentActivity"
import { AgentWidgets } from "@/components/agents/AgentWidgets"
import { QUOTE_EVENT, emit } from "@/lib/chat/events"
import { safeRehypePlugins } from "@/lib/chat/safe-markdown"
import type { MessageView as Message } from "@/lib/chat/view"

/** Model output is untrusted: never raw HTML, http(s) links only (see safe-markdown.ts). */
const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <Streamdown className="opx-chat-md" rehypePlugins={safeRehypePlugins}>{text}</Streamdown>
})

async function copy(text: string) {
  if (!text) return
  try { await navigator.clipboard.writeText(text); toast.success("Copied") } catch { toast.error("Couldn't copy") }
}

function PureMessageView({ message, live }: { message: Message; live: boolean }) {
  const swipe = useRef<{ x: number; y: number } | null>(null)
  // Widgets point at the screen only for a reply that streamed in during this visit.
  const sawLive = useRef(false)
  if (live) sawLive.current = true
  const mine = message.role === "user"

  return (
    <div
      className={`opx-chat-msg ${mine ? "me" : "ai"}`}
      data-role={message.role}
      onTouchStart={(e) => { const t = e.touches[0]; swipe.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0], s = swipe.current
        swipe.current = null
        if (!s || !t) return
        const dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y)
        // A deliberate right swipe (not a scroll) quotes this message into the composer.
        if (dx > 70 && dy < dx / 2.5 && message.text) { navigator.vibrate?.(8); emit(QUOTE_EVENT, message.text) }
      }}
    >
      {!mine && message.spans.length > 0 && (
        <>
          <AgentActivity live={live} spans={message.spans} />
          {!live && <AgentWidgets fresh={sawLive.current} spans={message.spans} />}
        </>
      )}
      {message.parts.map((p, i) =>
        p.kind === "reasoning" ? (
          <details key={i} className="opx-chat-why" open={live || undefined}>
            <summary>{live ? "Thinking…" : "How it reasoned"}</summary>
            <Markdown text={p.text} />
          </details>
        ) : mine ? (
          <div key={i} className="opx-chat-bubble">{p.text}</div>
        ) : (
          <Markdown key={i} text={p.text} />
        ),
      )}
      {!live && message.text && (
        <button type="button" className="opx-chat-copy" aria-label="Copy this message" title="Copy" onClick={() => copy(message.text)}><Copy size={14} strokeWidth={1.9} aria-hidden /></button>
      )}
    </div>
  )
}

export const MessageView = memo(PureMessageView, (a, b) => a.live === b.live && a.message === b.message)
