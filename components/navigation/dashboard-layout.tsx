"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "./app-sidebar"
import { Icon } from "@/components/jarvis/icons"

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Dashboard", sub: "Central Nervous System overview" },
  "/projects": { title: "Projects", sub: "All ventures and initiatives" },
  "/clients": { title: "Clients", sub: "Ongoing client work and retainers" },
  "/todos": { title: "Today", sub: "Daily focus and tasks" },
  "/ideas": { title: "Ideas Incubator", sub: "Capture and refine new ideas" },
  "/finance": { title: "Finance", sub: "Revenue, expenses, and net worth" },
  "/memory": { title: "Memory", sub: "Knowledge base and notes" },
  "/agents": { title: "Agent Dashboard", sub: "AI worker jobs and status" },
  "/calendar": { title: "Calendar", sub: "Schedule and events" },
  "/chat": { title: "AI Chat", sub: "Conversation with JARVIS" },
  "/settings": { title: "Settings", sub: "Preferences and configuration" },
  "/sops": { title: "SOPs", sub: "Standard operating procedures" },
}

interface DashboardLayoutProps {
  children: React.ReactNode
  noPad?: boolean
}

type Viewport = "mobile" | "tablet" | "desktop"

function viewportFor(width: number): Viewport {
  return width <= 768 ? "mobile" : width <= 1100 ? "tablet" : "desktop"
}

export function DashboardLayout({ children, noPad }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Deterministic on first render (SSR + hydration); corrected on mount.
  const [vp, setVp] = useState<Viewport>("desktop")
  const pathname = usePathname()

  const meta = PAGE_META[pathname] || { title: "JARVIS", sub: "Central Nervous System" }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setCmdOpen(o => !o)
    }
    if (e.key === "Escape") {
      setCmdOpen(false)
      setMobileOpen(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Track viewport: auto-collapse on tablet, close the drawer when
  // resizing back out of mobile.
  useEffect(() => {
    const onResize = () => {
      const next = viewportFor(window.innerWidth)
      setVp(next)
      if (next !== "mobile") setMobileOpen(false)
    }
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Close the drawer on route change.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  // On mobile the drawer always shows full labels; on tablet the
  // sidebar is forced to the icon rail; on desktop honor the toggle.
  const effectiveCollapsed = vp === "mobile" ? false : vp === "tablet" ? true : collapsed

  return (
    <div
      className={
        `j-app${effectiveCollapsed ? " j-collapsed" : ""}${mobileOpen ? " j-drawer-open" : ""}`
      }
    >
      <AppSidebar
        collapsed={effectiveCollapsed}
        onCollapsedChange={setCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {mobileOpen && (
        <div
          className="j-drawer-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="j-main">
        <header className="j-topbar">
          <div className="j-topbar-left">
            <button
              className="j-btn j-btn-icon j-btn-ghost j-nav-toggle"
              onClick={() => setMobileOpen(true)}
              title="Open menu"
              aria-label="Open navigation menu"
            >
              <Icon name="list" size={16} />
            </button>
            <div className="j-topbar-titles">
              <h1>{meta.title}</h1>
              <p>{meta.sub}</p>
            </div>
          </div>
          <div className="j-topbar-right">
            <button
              className="j-search"
              onClick={() => setCmdOpen(true)}
              aria-label="Open command palette"
            >
              <Icon name="search" size={14} />
              <span>Search or jump to…</span>
              <span className="j-kbd">⌘K</span>
            </button>
            <button
              className="j-btn j-btn-icon j-btn-ghost j-search-mobile"
              onClick={() => setCmdOpen(true)}
              title="Search"
              aria-label="Open search"
            >
              <Icon name="search" size={16} />
            </button>
            <button className="j-btn j-btn-icon j-btn-ghost" title="Notifications">
              <Icon name="bell" size={16} />
            </button>
          </div>
        </header>

        <main style={noPad
          ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }
          : { flex: 1, overflowY: "auto" }
        }>
          {children}
        </main>
      </div>

      {/* Command palette overlay */}
      {cmdOpen && (
        <div
          onClick={() => setCmdOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.6)",
            backdropFilter: "blur(4px)", zIndex: 50,
            display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh",
          }}
        >
          <div
            className="j-cmdk"
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(560px, 94vw)", background: "oklch(0.155 0 0)", borderRadius: 14,
              boxShadow: "0 0 0 1px oklch(1 0 0 / 0.12), 0 24px 48px -12px oklch(0 0 0 / 0.6)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
              <Icon name="search" size={16} />
              <input
                autoFocus
                placeholder="Search pages, projects, todos…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "oklch(0.985 0 0)", fontSize: 14, fontFamily: "inherit",
                }}
              />
              <span className="j-kbd">ESC</span>
            </div>
            <div style={{ padding: 8 }}>
              {Object.entries(PAGE_META).map(([href, m]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setCmdOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 7, textDecoration: "none",
                    color: "oklch(0.860 0 0)", fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "oklch(1 0 0 / 0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon name="arrow" size={14} />
                  <span style={{ flex: 1 }}>{m.title}</span>
                  <span style={{ fontSize: 11, color: "oklch(0.556 0 0)" }}>{m.sub}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
