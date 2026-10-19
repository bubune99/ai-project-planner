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
const KEY_WIDTH = "ade-dock-width"
const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function AssistantDock() {
  const pathname = usePathname() || "/"
  const [vw, setVw] = useState(0)
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(0)
  const [chatId, setChatId] = useState<string>("")
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

  const allowed = vw > 0 && dockAllowed(pathname, vw)
  const visible = allowed && open

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetch("/api/agents/allowed").then((r) => (r.ok ? r.json() : null)).then((j) => { if (!cancelled && j?.agents?.length) setAgentIds(j.agents) }).catch(() => {})
    return () => { cancelled = true }
  }, [allowed])

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

  if (!allowed || !chatId) return null

  if (!open) {
    return (
      <button
        type="button"
        data-ui="dock.open"
        onClick={() => setOpenPersist(true)}
        aria-label="Show the assistant"
        style={{
          position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 30,
          writingMode: "vertical-rl", background: "oklch(0.18 0 0)", color: "oklch(0.85 0 0)", border: "1px solid var(--j-ring)",
          borderLeft: 0, borderRadius: "0 10px 10px 0", padding: "14px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
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
        background: "var(--j-bg)", borderRight: "1px solid var(--j-hairline)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--j-hairline)", flexShrink: 0 }}>
        <strong style={{ fontSize: 14 }}>Assistant</strong>
        <span style={{ fontSize: 11.5, color: "oklch(0.58 0 0)" }}>{projectId ? "on this project" : "across everything"}</span>
        <div style={{ flex: 1 }} />
        <button type="button" data-ui="dock.new" onClick={() => setChatId(generateUUID())} style={dockBtn} title="Start a new conversation">New</button>
        <Link href="/chat" data-ui="dock.full" style={{ ...dockBtn, textDecoration: "none" }} title="Open the full chat and your history">Full chat</Link>
        <button type="button" data-ui="dock.hide" onClick={() => setOpenPersist(false)} aria-label="Hide the assistant" style={dockBtn}>Hide</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <SidebarProvider className="min-h-0 flex-1">
          <DataStreamProvider>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Chat
                key={chatId}
                id={chatId}
                initialMessages={[] as ChatMessage[]}
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
  background: "transparent", border: "1px solid var(--j-ring)", borderRadius: 7, color: "oklch(0.85 0 0)",
  padding: "4px 10px", minHeight: 30, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center",
}
