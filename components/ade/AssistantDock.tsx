"use client"

/*
 * AssistantDock — the assistant as a resizable panel beside whatever screen
 * you are on (the same shape as BYB's admin assistant). Row 1: the brand tile
 * and name, full chat, hide. Row 2: the tab strip (history, one tab per open
 * chat, "+"). Every open chat stays mounted, so one can keep working while
 * you talk to another. It lives in the root layout, so conversations survive
 * page-to-page navigation; it is hidden on the full-page chat, sign-in pages
 * and anything under 1100px. Keyboard: Left/Right/Home/End on the handle.
 * Width, open/closed and the open tabs are remembered per browser.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Maximize2, PanelLeftClose } from "lucide-react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { HistoryList } from "@/components/chat/HistoryList"
import { TabStrip } from "@/components/chat/TabStrip"
import { useAssistantChat } from "@/components/chat/useAssistantChat"
import { DEFAULT_AGENT, newChatId, type ChatMessage } from "@/lib/chat/view"
import { NEW_TITLE, addThread, closeDecision, closeThread, fromSaved, newThread, openSaved, titleFrom, toSaved, type Thread, type ThreadStatus } from "@/lib/chat/threads"
import { clampDock, defaultDock, dockAllowed, dockKey, projectIdFromPath } from "@/lib/ade/dock"

export const DOCK_TOGGLE_EVENT = "ade:toggle-assistant"
export const DOCK_STATE_EVENT = "ade:dock-state" // detail: { open: boolean }

const KEY_OPEN = "ade-dock-open"
const KEY_WIDTH = "ade-dock-width-v2"
const KEY_TABS = "ade-dock-tabs"
const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function AssistantDock() {
  const pathname = usePathname() || "/"
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [vw, setVw] = useState(0)
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(0)
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [panel, setPanel] = useState<"chat" | "history">("chat")
  const [agentIds, setAgentIds] = useState<string[] | undefined>(undefined)

  // Remember which tabs are open (not what they are doing) across page loads.
  useEffect(() => { if (threads.length) write(KEY_TABS, JSON.stringify(toSaved(threads, activeId))) }, [threads, activeId])

  const activate = (id: string) => { setActiveId(id); setPanel("chat") }
  const newChat = () => {
    const t = newThread(newChatId())
    const r = addThread(threads, t)
    if (!r.ok) { toast.message(r.error); return }
    setThreads(r.threads); activate(t.id)
  }
  // From history: its own tab, or in place of an unused new chat.
  const openChat = (id: string, title?: string) => {
    const r = openSaved(threads, activeId, id, title ?? "")
    if (!r.ok) { toast.message(r.error); return }
    setThreads(r.threads); activate(id)
  }
  const closeTab = (id: string) => {
    const t = threads.find((x) => x.id === id)
    if (!t) return
    let decision = closeDecision({ status: t.status, count: threads.length })
    if (decision === "confirm") {
      if (!confirm(`"${t.title}" is still working. Closing the tab stops it; the conversation stays in history. Stop and close?`)) return
      decision = closeDecision({ status: t.status, count: threads.length, confirmed: true })
    }
    if (decision === "reset") { const fresh = newThread(newChatId()); setThreads([fresh]); activate(fresh.id); return }
    const next = closeThread(threads, id, activeId)
    setThreads(next.threads); setActiveId(next.activeId)
  }
  // A deleted conversation can't stay open in a tab.
  const dropDeleted = (ids: string[]) => {
    let next = { threads, activeId }
    for (const id of ids) next = closeThread(next.threads, id, next.activeId)
    if (next.threads.length === threads.length) return
    if (!next.threads.length) { const fresh = newThread(newChatId()); next = { threads: [fresh], activeId: fresh.id } }
    setThreads(next.threads); setActiveId(next.activeId)
  }
  // Each chat reports what it is doing; the first question names its tab.
  const onStatus = useCallback((id: string, status: ThreadStatus, firstAsk?: string) => {
    setThreads((prev) => {
      const t = prev.find((x) => x.id === id)
      if (!t) return prev
      const title = t.title === NEW_TITLE && firstAsk ? titleFrom(firstAsk) : t.title
      const fresh = t.fresh && status === "idle"
      if (t.status === status && t.title === title && !!t.fresh === !!fresh) return prev
      return prev.map((x) => (x.id === id ? { id: x.id, title, status, ...(fresh ? { fresh: true } : {}) } : x))
    })
  }, [])
  const drag = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    const w = window.innerWidth
    setVw(w)
    setOpen(read(KEY_OPEN) !== "0")
    const saved = Number(read(KEY_WIDTH))
    setWidth(saved > 0 ? clampDock(saved, w) : defaultDock(w))
    let savedTabs: unknown = null
    try { savedTabs = JSON.parse(read(KEY_TABS) || "null") } catch { /* start fresh */ }
    const tabs = fromSaved(savedTabs)
    if (tabs.threads.length) { setThreads(tabs.threads); setActiveId(tabs.activeId) }
    else { const t = newThread(newChatId()); setThreads([t]); setActiveId(t.id) }
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const pathAllowed = vw > 0 && dockAllowed(pathname, vw)
  const allowed = pathAllowed
  const visible = pathAllowed && authed === true && open

  // Signed-in only: the dock appears after the server says who you are, never on a sign-in or signed-out page.
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetch("/api/agents/allowed", { credentials: "include" })
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) { setAuthed(false); return }
        const j = await r.json().catch(() => null)
        if (j?.agents?.length) { setAgentIds(j.agents); setAuthed(true) } else setAuthed(false)
      })
      .catch(() => { if (!cancelled) setAuthed(false) })
    return () => { cancelled = true }
  }, [allowed, pathname])

  // Push the page over by the dock's width; the planner nav collapses to its icon rail.
  useEffect(() => {
    const root = document.documentElement
    const w = Math.min(clampDock(width || 0, vw || 1440), Math.max(0, (vw || 1440) - 420))
    if (visible) {
      root.style.setProperty("--ade-w", `${w}px`)
      document.body.classList.add("ade-open")
    } else {
      root.style.removeProperty("--ade-w")
      document.body.classList.remove("ade-open")
    }
    window.dispatchEvent(new CustomEvent(DOCK_STATE_EVENT, { detail: { open: visible } }))
    return () => { document.body.classList.remove("ade-open"); root.style.removeProperty("--ade-w") }
  }, [visible, width, vw])

  const setOpenPersist = useCallback((v: boolean) => { setOpen(v); write(KEY_OPEN, v ? "1" : "0") }, [])
  useEffect(() => {
    const toggle = () => setOpenPersist(!open)
    window.addEventListener(DOCK_TOGGLE_EVENT, toggle)
    return () => window.removeEventListener(DOCK_TOGGLE_EVENT, toggle)
  }, [open, setOpenPersist])

  const setW = (w: number) => { const c = clampDock(w, vw); setWidth(c); write(KEY_WIDTH, String(c)) }

  if (!pathAllowed || authed !== true || !activeId) return null

  if (!open) {
    return (
      <button
        type="button"
        data-ui="dock.open"
        onClick={() => setOpenPersist(true)}
        aria-label="Show the assistant"
        style={{
          position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 30,
          writingMode: "vertical-rl", background: "var(--opx-card)", color: "var(--opx-ink)", border: 0,
          borderRadius: "0 14px 14px 0", padding: "16px 9px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 6px 20px rgb(0 0 0 / 0.25)",
        }}
      >
        Assistant
      </button>
    )
  }

  const projectId = projectIdFromPath(pathname)
  const w = Math.min(clampDock(width, vw), Math.max(0, vw - 420))

  return (
    <aside
      data-ui="dock"
      data-fbw-skip="false"
      aria-label="Assistant"
      style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width: w, zIndex: 30, display: "flex", flexDirection: "column",
        background: "var(--opx-bg)", padding: "10px 0 10px 10px", color: "var(--opx-ink)",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--opx-card)", borderRadius: 26, overflow: "hidden" }}>
      <div className="opx-dock-head" data-ui="chat.header">
        <span className="opx-dock-tile" aria-hidden>P</span>
        <span className="opx-dock-name"><b>Planner</b>{projectId && <small>This project</small>}</span>
        <Link href="/chat" data-ui="dock.full" className="opx-dock-btn" title="Open the full chat" aria-label="Open the full chat"><Maximize2 size={16} strokeWidth={1.9} /></Link>
        <span className="opx-dock-div" aria-hidden />
        <button type="button" data-ui="dock.hide" className="opx-dock-btn" onClick={() => setOpenPersist(false)} title="Hide the assistant" aria-label="Hide the assistant"><PanelLeftClose size={16} strokeWidth={1.9} /></button>
      </div>
      <TabStrip
        threads={threads}
        activeId={activeId}
        historyOpen={panel === "history"}
        onHistory={() => setPanel(panel === "history" ? "chat" : "history")}
        onActivate={activate}
        onClose={closeTab}
        onNew={newChat}
      />
      {panel === "history" && (
        <div data-ui="dock.history-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 10px 10px" }}>
          <HistoryList activeId={activeId} onOpen={openChat} onDeleted={dropDeleted} />
        </div>
      )}
      {threads.map((t) => {
        const showing = t.id === activeId && panel !== "history"
        return (
          <div key={t.id} role="tabpanel" aria-label={t.title} hidden={!showing} style={{ flex: 1, minHeight: 0, display: showing ? "flex" : "none", flexDirection: "column" }}>
            <ThreadPane thread={t} active={showing} agentIds={agentIds} projectId={projectId} onStatus={onStatus} />
          </div>
        )
      })}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the assistant column"
        aria-valuetext={`${w}px`}
        tabIndex={0}
        data-ade-split-handle=""
        data-ui="dock.resize"
        onKeyDown={(e) => { const n = dockKey(w, e.key, vw); if (n !== null) { e.preventDefault(); setW(n) } }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, w }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (drag.current) setW(drag.current.w + (e.clientX - drag.current.x)) }}
        onPointerUp={() => { drag.current = null }}
        style={{ position: "absolute", top: 0, bottom: 0, right: -3, width: 6, cursor: "col-resize", touchAction: "none", zIndex: 31 }}
      />
    </aside>
  )
}

/** One open chat. A saved one loads its messages first; then it stays mounted while its tab is open. */
function ThreadPane({ thread, active, agentIds, projectId, onStatus }: { thread: Thread; active: boolean; agentIds?: string[]; projectId: string | null; onStatus: (id: string, status: ThreadStatus, firstAsk?: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(thread.fresh ? [] : null)
  const id = thread.id
  useEffect(() => {
    if (messages !== null) return
    let live = true
    fetch(`/api/chat/messages?id=${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { messages: [] })) // never saved, or gone: start empty
      .then((j) => { if (live) setMessages((j.messages ?? []) as ChatMessage[]) })
      .catch(() => { if (live) setMessages([]) })
    return () => { live = false }
    // Load once per conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const report = useCallback((status: ThreadStatus, firstAsk?: string) => onStatus(id, status, firstAsk), [id, onStatus])
  if (messages === null) return <div className="opx-muted" style={{ flex: 1, display: "grid", placeItems: "center", fontSize: 13.5 }}>Loading the conversation…</div>
  return <ThreadChat id={id} initialMessages={messages} active={active} agentIds={agentIds} projectId={projectId} onStatus={report} />
}

function ThreadChat({ id, initialMessages, active, agentIds, projectId, onStatus }: { id: string; initialMessages: ChatMessage[]; active: boolean; agentIds?: string[]; projectId: string | null; onStatus: (status: ThreadStatus, firstAsk?: string) => void }) {
  const model = useAssistantChat({ id, initialMessages, initialAgent: DEFAULT_AGENT, agentIds, projectId, docked: true, active, onStatus })
  return <ChatPanel model={model} compact />
}
