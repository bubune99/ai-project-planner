"use client"

/*
 * AssistantDock — the ADE view for the planner: the assistant as a resizable
 * panel beside whatever screen you are on (same shape as Dzidzor and BYB).
 * It lives in the root layout, so the conversation survives page-to-page
 * navigation; it knows the open project; it is hidden on the full-page chat,
 * sign-in pages and anything under 1100px (phones use the Ask tab instead).
 * Keyboard: Left/Right/Home/End on the handle. State is remembered per browser.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Plus, History, Maximize2, PanelLeftClose } from "lucide-react"
import { usePathname } from "next/navigation"
import { Chat } from "@/components/chatsdk/chat"
import { DataStreamProvider } from "@/components/chatsdk/data-stream-provider"
import { SidebarProvider } from "@/components/chatsdk/ui/sidebar"
import { DEFAULT_CHAT_MODEL } from "@/lib/chatsdk/ai/models"
import { generateUUID } from "@/lib/chatsdk/utils"
import type { ChatMessage } from "@/lib/chatsdk/types"
import { clampDock, defaultDock, dockAllowed, dockKey, projectIdFromPath } from "@/lib/ade/dock"

export const DOCK_TOGGLE_EVENT = "ade:toggle-assistant"
export const DOCK_STATE_EVENT = "ade:dock-state" // detail: { open: boolean }

const KEY_OPEN = "ade-dock-open"
const KEY_WIDTH = "ade-dock-width-v2"
const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function AssistantDock() {
  const pathname = usePathname() || "/"
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [vw, setVw] = useState(0)
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(0)
  const [chatId, setChatId] = useState<string>("")
  const [initial, setInitial] = useState<ChatMessage[]>([])
  const [panel, setPanel] = useState<"chat" | "history">("chat")
  const [agentIds, setAgentIds] = useState<string[] | undefined>(undefined)
  const drag = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    const w = window.innerWidth
    setVw(w)
    setOpen(read(KEY_OPEN) !== "0")
    const saved = Number(read(KEY_WIDTH))
    setWidth(saved > 0 ? clampDock(saved, w) : defaultDock(w))
    setChatId(generateUUID())
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

  if (!pathAllowed || authed !== true || !chatId) return null

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
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "16px 14px 12px 20px", flexShrink: 0 }}>
        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Assistant</div>
          <div style={{ fontSize: 12.5, color: "var(--opx-muted)" }}>{projectId ? "Working on this project" : "Across all your projects"}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" data-ui="dock.new" className="opx-ib" onClick={() => { setInitial([]); setChatId(generateUUID()); setPanel("chat") }} title="New conversation" aria-label="New conversation"><Plus size={17} strokeWidth={1.9} /></button>
        <button type="button" data-ui="dock.history" className={`opx-ib${panel === "history" ? " on" : ""}`} onClick={() => setPanel(panel === "history" ? "chat" : "history")} aria-pressed={panel === "history"} title="Past conversations" aria-label="Past conversations"><History size={17} strokeWidth={1.9} /></button>
        <Link href="/chat" data-ui="dock.full" className="opx-ib" title="Open the full chat" aria-label="Open the full chat"><Maximize2 size={16} strokeWidth={1.9} /></Link>
        <button type="button" data-ui="dock.hide" className="opx-ib" onClick={() => setOpenPersist(false)} title="Hide the assistant" aria-label="Hide the assistant"><PanelLeftClose size={17} strokeWidth={1.9} /></button>
      </div>
      {panel === "history" && (
        <DockHistory
          onOpen={(id, msgs) => { setInitial(msgs); setChatId(id); setPanel("chat") }}
          onClose={() => setPanel("chat")}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: panel === "history" ? "none" : "flex", flexDirection: "column" }}>
        <SidebarProvider className="min-h-0 flex-1">
          <DataStreamProvider>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Chat
                key={chatId}
                id={chatId}
                initialMessages={initial}
                initialChatModel={DEFAULT_CHAT_MODEL}
                initialVisibilityType="private"
                isReadonly={false}
                autoResume={false}
                agentIds={agentIds}
                context={projectId ? { projectId } : undefined}
                docked
              />
            </div>
          </DataStreamProvider>
        </SidebarProvider>
      </div>
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

const dockBtn: React.CSSProperties = {
  background: "var(--opx-card)", border: "1px solid var(--opx-line)", borderRadius: 999, color: "var(--opx-ink)",
  padding: "4px 12px", minHeight: 30, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center",
}

type HistoryRow = { id: string; title: string; createdAt: string }

/** The dock's own conversation list: today / this week / older; picking one loads it into the dock. */
function DockHistory({ onOpen, onClose }: { onOpen: (id: string, messages: ChatMessage[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let off = false
    fetch("/api/history?limit=40", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!off) setRows(j.chats ?? []) })
      .catch(() => { if (!off) { setRows([]); setErr("Could not load your history.") } })
    return () => { off = true }
  }, [])
  const open = async (id: string) => {
    setBusy(id); setErr(null)
    try {
      const r = await fetch(`/api/chat/messages?id=${id}`, { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      onOpen(id, (j.messages ?? []) as ChatMessage[])
    } catch {
      setErr("Could not open that conversation.")
      setBusy(null)
    }
  }
  const day = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d <= 7 ? "This week" : "Older"
  }
  const groups = (rows ?? []).reduce<Record<string, HistoryRow[]>>((acc, r) => { (acc[day(r.createdAt)] ??= []).push(r); return acc }, {})
  return (
    <div data-ui="dock.history-panel" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 8px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "6px 8px" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--opx-ink)" }}>Your conversations</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} style={dockBtn}>Back to chat</button>
      </div>
      {rows === null && <div style={{ padding: 16, fontSize: 13, color: "var(--opx-muted)" }}>Loading…</div>}
      {rows !== null && rows.length === 0 && !err && <div style={{ padding: 16, fontSize: 13, color: "var(--opx-muted)" }}>No conversations yet.</div>}
      {err && <div style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--j-neg)" }}>{err}</div>}
      {["Today", "Yesterday", "This week", "Older"].filter((g) => groups[g]?.length).map((g) => (
        <div key={g}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--opx-muted)", padding: "12px 10px 2px", margin: 0 }}>{g}</p>
          {groups[g].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => open(r.id)}
              disabled={busy !== null}
              style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: 0, borderRadius: 12, padding: "9px 10px", minHeight: 40, fontSize: 13.5, color: busy === r.id ? "var(--opx-accent)" : "var(--opx-ink)", cursor: "pointer", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {r.title || "Untitled"}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
