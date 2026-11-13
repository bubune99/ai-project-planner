"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { Icon, type IconName } from "@/components/jarvis/icons"

export const OPEN_POPOUT_EVENT = "app:toggle-menu-popout" // detail: { left, top }

interface NavItem {
  title: string
  href: string
  icon: IconName
  badge?: string
  soon?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

/*
 * Grouped as in the 2026-11-13 mock-up: Work, Think, Run, with Settings
 * pinned at the bottom. SOPs live inside Library; AI Chat left the menu
 * (the assistant panel replaces it; /chat still works). "Impact" (/impact) stays hidden: it reads catalog
 * surfaces, and the catalog scanner has never run.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    title: "Work",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: "grid" },
      { title: "Projects", href: "/projects", icon: "folder" },
      { title: "Today", href: "/todos", icon: "target" },
      { title: "Inbox", href: "/inbox", icon: "bell" },
      { title: "Calendar", href: "/calendar", icon: "cal" },
    ],
  },
  {
    title: "Think",
    items: [
      { title: "Ideas", href: "/ideas", icon: "bulb" },
      { title: "Memory", href: "/memory", icon: "brain" },
      { title: "Library", href: "/library", icon: "library" },
      { title: "Catalog", href: "/catalog", icon: "layers" },
    ],
  },
  {
    title: "Run",
    items: [
      { title: "Agents", href: "/agents", icon: "bot" },
      { title: "Clients", href: "/clients", icon: "users" },
      { title: "Finance", href: "/finance", icon: "wallet" },
    ],
  },
]
const SETTINGS: NavItem = { title: "Settings", href: "/settings", icon: "cog" }

/** "Capture something": the three things people capture most, one tap each. */
const CAPTURE: { title: string; hint: string; href?: string; ask?: string }[] = [
  { title: "New task", hint: "On a project, or just for you", href: "/todos" },
  { title: "Capture an idea", hint: "Rough is fine", href: "/ideas" },
  { title: "Log a decision", hint: "With the assistant", ask: "Help me log a decision: ask me what I decided, why, and which options I weighed, then record it on the right project." },
]

function CaptureButton({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="opx-capture">
      <button type="button" className="opx-cta" data-ui="nav.capture" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Capture something <span aria-hidden>+</span>
      </button>
      {open && (
        <div className="opx-capmenu" role="menu">
          {CAPTURE.map((c) => c.href ? (
            <Link key={c.title} role="menuitem" href={c.href} onClick={() => { setOpen(false); onDone?.() }}><b>{c.title}</b><small>{c.hint}</small></Link>
          ) : (
            <button key={c.title} role="menuitem" type="button" onClick={() => { setOpen(false); onDone?.(); window.dispatchEvent(new CustomEvent("jarvis:sheet", { detail: { text: c.ask } })) }}><b>{c.title}</b><small>{c.hint}</small></button>
          ))}
        </div>
      )}
    </div>
  )
}

interface AppSidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
  /** The assistant dock is open: no rail at all; the header's hamburger opens the popout menu. */
  navHidden?: boolean
}

export function AppSidebar({
  collapsed = false,
  onCollapsedChange,
  mobileOpen = false,
  onCloseMobile,
  navHidden = false,
}: AppSidebarProps) {
  const pathname = usePathname()
  const user = useUser()

  // How many questions are waiting on the owner. Refetched on navigation, so
  // answering on /inbox clears the badge on the next page.
  const [inboxCount, setInboxCount] = useState(0)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch("/api/inbox", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.success) setInboxCount(Array.isArray(j.data) ? j.data.length : 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, pathname])

  // Rail mode: hover/focus shows the label beside the icon; the J (or chevron beside the dock) opens the full menu.
  const rootRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ title: string; badge?: string; top: number; left: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ left: number; top: number }>).detail
      if (d) setAnchor(d)
      setMenuOpen((v) => !v)
    }
    window.addEventListener(OPEN_POPOUT_EVENT, on)
    return () => window.removeEventListener(OPEN_POPOUT_EVENT, on)
  }, [])
  const showTip = (el: HTMLElement, title: string, badge?: string) => {
    if (!collapsed || mobileOpen) return
    const r = el.getBoundingClientRect()
    setTip({ title, badge, top: r.top + r.height / 2, left: r.right + 10 })
  }
  useEffect(() => { setMenuOpen(false); setTip(null) }, [pathname, collapsed])
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t && !t.closest('[data-ui="nav.popout"], [data-ui="nav.rail.menu"], [data-ui="nav.rail.chevron"], [data-ui="nav.hamburger"]')) setMenuOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false)
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", key, true)
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true) }
  }, [menuOpen])
  const railRight = rootRef.current ? Math.round(rootRef.current.getBoundingClientRect().right) : 72

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  return (
    <div
      ref={rootRef}
      className={`j-sidebar${collapsed ? " j-collapsed" : ""}${mobileOpen ? " j-mobile-open" : ""}`}
    >
      {/* Brand */}
      <div className="j-brand" style={collapsed ? { justifyContent: "center", padding: "6px 0 14px" } : {}}>
        {collapsed && !mobileOpen ? (
          <button
            type="button"
            data-ui="nav.rail.menu"
            className="j-brand-mark"
            aria-label="Open the menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            onMouseEnter={(e) => showTip(e.currentTarget, "Menu")}
            onMouseLeave={() => setTip(null)}
            style={{ border: 0, cursor: "pointer", font: "inherit" }}
          >
            P
          </button>
        ) : (
          <div className="j-brand-mark">P</div>
        )}
        {!collapsed && (
          <div className="j-brand-name">
            <strong>Planner</strong>
            <span>Everything you're building</span>
          </div>
        )}
        <button
          onClick={onCloseMobile}
          className="j-btn j-btn-icon j-btn-ghost j-drawer-close"
          style={{ marginLeft: "auto" }}
          title="Close menu"
          aria-label="Close menu"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {!collapsed && <CaptureButton onDone={onCloseMobile} />}

      {/* Navigation */}
      {[...NAV_SECTIONS, { title: "", items: [SETTINGS] }].map(section => (
        <div key={section.title} className="j-nav-section">
          {!collapsed && section.title && (
            <div className="j-nav-section-title">{section.title}</div>
          )}
          {section.items.map(item => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            const badge = item.href === "/inbox" ? (inboxCount > 0 ? String(inboxCount) : undefined) : item.badge
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`j-nav-item${isActive ? " j-active" : ""}`}
                style={collapsed ? { justifyContent: "center", padding: "9px 0" } : {}}
                onMouseEnter={(e) => showTip(e.currentTarget, item.title, badge)}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => showTip(e.currentTarget, item.title, badge)}
                onBlur={() => setTip(null)}
                aria-label={collapsed ? item.title : undefined}
              >
                <span className="j-nav-icon">
                  <Icon name={item.icon} size={16} />
                </span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.title}</span>
                    {badge && (
                      <span className={`j-nav-badge${item.soon ? " j-soon" : ""}`}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            )
          })}
        </div>
      ))}

      {/* Collapse toggle */}
      <button
        data-ui="nav.rail.chevron"
        onClick={() => onCollapsedChange?.(!collapsed)}
        aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
        className="j-nav-item"
        style={{ marginTop: "auto", justifyContent: collapsed ? "center" : undefined }}
      >
        <span className="j-nav-icon">
          <Icon name={collapsed ? "chevR" : "x"} size={16} />
        </span>
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* Footer / user */}
      {user && (
        <div className="j-sidebar-foot" style={collapsed ? { justifyContent: "center" } : {}}>
          <div className="j-avatar">{initials}</div>
          {!collapsed && (
            <div className="j-foot-meta">
              <strong>{user.displayName || "User"}</strong>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.primaryEmail}
              </span>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => user.signOut()}
              className="j-btn j-btn-icon j-btn-ghost"
              title="Sign out"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      )}

      {tip && collapsed && !menuOpen && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed", left: tip.left, top: tip.top, transform: "translateY(-50%)", zIndex: 2147483000, pointerEvents: "none",
            background: "var(--opx-ink)", color: "var(--opx-card)", border: 0, borderRadius: 10,
            padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgb(0 0 0 / .3)", display: "flex", gap: 8, alignItems: "center",
          }}
        >
          {tip.title}
          {tip.badge && <span className="j-nav-badge">{tip.badge}</span>}
        </div>,
        document.body
      )}

      {menuOpen && (collapsed || navHidden) && !mobileOpen && typeof document !== "undefined" && createPortal(
        <nav
          data-ui="nav.popout"
          aria-label="Menu"
          style={{
            position: "fixed", left: anchor?.left ?? railRight + 6, top: anchor?.top ?? 8, maxHeight: `calc(100vh - ${(anchor?.top ?? 8) + 8}px)`, width: 264, zIndex: 2147483000, overflowY: "auto",
            background: "var(--opx-card)", color: "var(--opx-ink)", border: "1px solid var(--opx-line)", borderRadius: 22, padding: 12,
            boxShadow: "0 18px 48px rgb(0 0 0 / 0.28)", display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 10px" }}>
            <div className="j-brand-mark">P</div>
            <div style={{ lineHeight: 1.25 }}><div style={{ fontWeight: 600, fontSize: 15 }}>Planner</div><div style={{ fontSize: 12, color: "var(--opx-muted)" }}>Everything you&apos;re building</div></div>
          </div>
          <CaptureButton onDone={() => setMenuOpen(false)} />
          {[...NAV_SECTIONS, { title: "", items: [SETTINGS] }].map((section) => (
            <div key={section.title || "bottom"} style={{ marginBottom: 6, ...(section.title ? {} : { borderTop: "1px solid var(--opx-line)", paddingTop: 6 }) }}>
              {section.title && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--opx-muted)", padding: "8px 10px 4px" }}>{section.title}</div>}
              {section.items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                const badge = item.href === "/inbox" ? (inboxCount > 0 ? String(inboxCount) : undefined) : item.badge
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`j-nav-item${active ? " j-active" : ""}`}
                    style={{ minHeight: 40 }}
                  >
                    <span className="j-nav-icon"><Icon name={item.icon} size={16} /></span>
                    <span style={{ flex: 1 }}>{item.title}</span>
                    {badge && <span className={`j-nav-badge${item.soon ? " j-soon" : ""}`}>{badge}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
          {user && (
            <div style={{ borderTop: "1px solid var(--opx-line)", marginTop: 8, paddingTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div className="j-avatar">{initials}</div>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName || "User"}</div>
                <div style={{ fontSize: 11.5, color: "var(--opx-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.primaryEmail}</div>
              </div>
              <button type="button" onClick={() => user.signOut()} className="j-btn j-btn-ghost" style={{ fontSize: 12 }}>Sign out</button>
            </div>
          )}
        </nav>,
        document.body
      )}
    </div>
  )
}
