"use client"

/*
 * The tab strip above the conversation (the same shape as BYB's admin
 * assistant): history at the far left behind a divider, one tab per open
 * chat with its status, "+" after the last tab, and ‹ › "+N" when they don't
 * fit. Sizes, overflow and close rules are in lib/chat/threads.ts.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, CircleX, History, Plus, X } from "lucide-react"
import { STATUS_WORDS, STRIP, revealStart, tabWindow, type Thread } from "@/lib/chat/threads"

function Status({ status }: { status: Thread["status"] }) {
  if (status === "thinking") return <span className="opx-tab-ring" aria-hidden />
  if (status === "done") return <Check size={14} strokeWidth={1.9} aria-hidden style={{ flex: "none" }} />
  if (status === "error") return <CircleX size={14} strokeWidth={1.9} aria-hidden style={{ flex: "none", color: "var(--opx-hot)" }} />
  return null
}

interface Props {
  threads: Thread[]
  activeId: string | null
  historyOpen: boolean
  onHistory: () => void
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabStrip({ threads, activeId, historyOpen, onHistory, onActivate, onClose, onNew }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [start, setStart] = useState(0)
  const [more, setMore] = useState(false)

  useLayoutEffect(() => {
    const el = area.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const win = tabWindow({ width, count: threads.length, start })
  const activeIndex = threads.findIndex((t) => t.id === activeId)

  // A newly active tab (new chat, opened from history, picked from "+N") scrolls into view.
  useEffect(() => {
    if (activeIndex < 0) return
    setStart((s) => revealStart(tabWindow({ width, count: threads.length, start: s }), activeIndex))
  }, [activeIndex, width, threads.length])

  useEffect(() => {
    if (!more) return
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.("[data-tab-more]")) setMore(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false) }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", key)
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key) }
  }, [more])

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step || activeIndex < 0) return
    const next = threads[activeIndex + step]
    if (!next) return
    e.preventDefault()
    onActivate(next.id)
  }

  const visible = threads.slice(win.start, win.end)
  return (
    <div className="opx-tabs" data-ui="chat.tabs.strip">
      <button type="button" className="opx-tabs-btn" data-ui="chat.tabs.history" aria-pressed={historyOpen} aria-label={historyOpen ? "Back to the conversation" : "Past conversations"} title={historyOpen ? "Back to the conversation" : "Past conversations"} onClick={onHistory}>
        <History size={16} strokeWidth={1.9} aria-hidden />
      </button>
      <span className="opx-tabs-div" aria-hidden />
      <div className="opx-tabs-area" ref={area}>
        <div className="opx-tabs-list" role="tablist" aria-label="Open chats" onKeyDown={onKey}>
          {visible.map((t, i) => {
            const on = t.id === activeId && !historyOpen
            const prevOn = i > 0 && visible[i - 1].id === activeId && !historyOpen
            return (
              <div key={t.id} style={{ display: "contents" }}>
                {i > 0 && !on && !prevOn && <span className="opx-tab-sep" aria-hidden />}
                <div className={`opx-tab${on ? " on" : ""}`} style={{ minWidth: on ? STRIP.tabMinActive : STRIP.tabMinInactive, maxWidth: STRIP.tabMax, flex: `0 1 ${STRIP.tabMax}px` }} data-ui="chat.tabs.tab" data-status={t.status}>
                  <button type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} title={`${t.title} · ${STATUS_WORDS[t.status]}`} onClick={() => onActivate(t.id)}>
                    <Status status={t.status} />
                    <span>{t.title}</span>
                    {t.status !== "idle" && <span className="opx-sr">, {STATUS_WORDS[t.status]}</span>}
                  </button>
                  <button type="button" className="opx-tab-x" aria-label={`Close ${t.title}`} title="Close" tabIndex={on ? 0 : -1} data-ui="chat.tabs.close" onClick={() => onClose(t.id)}><X size={14} strokeWidth={1.9} aria-hidden /></button>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" className="opx-tabs-btn" style={{ marginLeft: 4 }} data-ui="chat.tabs.new" aria-label="New chat" title="New chat" onClick={onNew}><Plus size={16} strokeWidth={1.9} aria-hidden /></button>
        {win.overflow && (
          <span className="opx-tabs-more" data-tab-more>
            <button type="button" className="opx-tabs-btn sm" aria-label="Earlier tabs" disabled={!win.canPrev} onClick={() => setStart(win.start - 1)}><ChevronLeft size={14} strokeWidth={2} aria-hidden /></button>
            <button type="button" className="opx-tabs-btn sm" aria-label="Later tabs" disabled={!win.canNext} onClick={() => setStart(win.start + 1)}><ChevronRight size={14} strokeWidth={2} aria-hidden /></button>
            <button type="button" className="opx-tabs-btn sm count" data-ui="chat.tabs.more" aria-haspopup="menu" aria-expanded={more} aria-label={`All open chats (${win.hidden} not shown)`} onClick={() => setMore((v) => !v)}>+{win.hidden}</button>
            {more && (
              <div className="opx-chat-menu opx-tabs-menu" role="menu">
                {threads.map((t) => (
                  <button key={t.id} type="button" role="menuitem" aria-current={t.id === activeId || undefined} onClick={() => { setMore(false); onActivate(t.id) }}>
                    <Status status={t.status} /><span><b>{t.title}</b></span>
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
