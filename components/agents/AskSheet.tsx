"use client"

/*
 * AskSheet — pull-up "Ask JARVIS" from any page. Long-press (or right-click)
 * something, choose "Ask JARVIS about this", and this sheet opens with the
 * question started. Sending hands off to the full-screen chat (/chat?query=),
 * so there is one conversation surface, not a second chat to maintain.
 */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SHEET_EVENT, type TextDetail } from "@/lib/chatsdk/chat-events"

export function AskSheet() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const on = (e: Event) => {
      setText((e as CustomEvent<TextDetail>).detail?.text ?? "")
      setOpen(true)
      setTimeout(() => ref.current?.focus(), 60)
    }
    window.addEventListener(SHEET_EVENT, on)
    return () => window.removeEventListener(SHEET_EVENT, on)
  }, [])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [open])

  if (!open) return null
  const send = () => {
    const q = text.trim()
    if (!q) return
    setOpen(false)
    router.push(`/chat?query=${encodeURIComponent(q)}`)
  }

  return (
    <div data-fbw="ask-sheet" style={{ position: "fixed", inset: 0, zIndex: 2147483645 }}>
      <div onClick={() => setOpen(false)} aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)" }} />
      <div
        role="dialog"
        aria-label="Ask JARVIS"
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 560,
          background: "oklch(0.155 0 0)", borderRadius: "16px 16px 0 0", border: "1px solid var(--j-ring)",
          padding: "14px 14px calc(14px + env(safe-area-inset-bottom))", display: "grid", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 14 }}>Ask JARVIS</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: 0, color: "oklch(0.7 0 0)", fontSize: 18, minWidth: 36, minHeight: 36 }}>✕</button>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send() }}
          rows={4}
          placeholder="Ask anything about this…"
          style={{
            width: "100%", background: "oklch(0.2 0 0)", color: "oklch(0.95 0 0)", border: "1px solid var(--j-ring)",
            borderRadius: 10, padding: "10px 12px", fontSize: 16, fontFamily: "inherit", resize: "none", boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          style={{
            background: "var(--j-accent)", color: "oklch(0.15 0 0)", border: 0, borderRadius: 10, minHeight: 44,
            fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: text.trim() ? 1 : 0.5,
          }}
        >
          Ask
        </button>
      </div>
    </div>
  )
}
