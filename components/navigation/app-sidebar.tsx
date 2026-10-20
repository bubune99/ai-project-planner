"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@stackframe/stack"
import { Icon, type IconName } from "@/components/jarvis/icons"

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

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: "grid" },
      { title: "Projects", href: "/projects", icon: "folder" },
      { title: "Clients", href: "/clients", icon: "users" },
      { title: "Today", href: "/todos", icon: "target" },
      { title: "Inbox", href: "/inbox", icon: "bell" },
    ],
  },
  {
    title: "Modules",
    items: [
      { title: "Ideas", href: "/ideas", icon: "bulb", badge: "New", soon: true },
      { title: "Finance", href: "/finance", icon: "wallet", badge: "New", soon: true },
      { title: "Memory", href: "/memory", icon: "brain", badge: "New", soon: true },
      { title: "Agents", href: "/agents", icon: "bot" },
    ],
  },
  {
    title: "Tools",
    items: [
      { title: "Calendar", href: "/calendar", icon: "cal" },
      { title: "AI Chat", href: "/chat", icon: "msg" },
      { title: "SOPs", href: "/sops", icon: "sop" },
      { title: "Library", href: "/library", icon: "library" },
      { title: "Catalog", href: "/catalog", icon: "layers" },
      /*
        "Impact" (/impact) hidden 2026-10-03. It is the Catalog Impact Graph —
        Idea H wave 5 — and it reads from catalog surfaces, of which there are
        none: the catalog scanner has never run, so the page opened onto an
        empty graph nobody could place. The route and its 575 lines are kept;
        restore this entry once the scanner has populated the catalog.
      */
    ],
  },
  {
    title: "System",
    items: [
      { title: "Settings", href: "/settings", icon: "cog" },
    ],
  },
]

interface AppSidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
  /** The assistant dock is open: the nav is a rail and its chevron opens the popout menu instead of expanding. */
  dockOpen?: boolean
}

export function AppSidebar({
  collapsed = false,
  onCollapsedChange,
  mobileOpen = false,
  onCloseMobile,
  dockOpen = false,
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
      if (t && !t.closest('[data-ui="nav.popout"], [data-ui="nav.rail.menu"], [data-ui="nav.rail.chevron"]')) setMenuOpen(false)
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
            J
          </button>
        ) : (
          <div className="j-brand-mark">J</div>
        )}
        {!collapsed && (
          <div className="j-brand-name">
            <strong>JARVIS</strong>
            <span>Central Nervous System</span>
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

      {/* Navigation */}
      {NAV_SECTIONS.map(section => (
        <div key={section.title} className="j-nav-section">
          {!collapsed && (
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
        onClick={() => (collapsed && dockOpen ? setMenuOpen((v) => !v) : onCollapsedChange?.(!collapsed))}
        aria-label={collapsed && dockOpen ? "Open the menu" : collapsed ? "Expand the menu" : "Collapse the menu"}
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
            background: "oklch(0.2 0 0)", color: "oklch(0.96 0 0)", border: "1px solid var(--j-ring)", borderRadius: 8,
            padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,.5)", display: "flex", gap: 8, alignItems: "center",
          }}
        >
          {tip.title}
          {tip.badge && <span className="j-nav-badge">{tip.badge}</span>}
        </div>,
        document.body
      )}

      {menuOpen && collapsed && !mobileOpen && typeof document !== "undefined" && createPortal(
        <nav
          data-ui="nav.popout"
          aria-label="Menu"
          style={{
            position: "fixed", left: railRight + 6, top: 8, bottom: 8, width: 264, zIndex: 2147483000, overflowY: "auto",
            background: "oklch(0.16 0 0)", border: "1px solid var(--j-ring)", borderRadius: 14, padding: 10,
            boxShadow: "0 18px 48px rgba(0,0,0,.6)",
          }}
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.5 0 0)", padding: "8px 10px 4px" }}>{section.title}</div>
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
            <div style={{ borderTop: "1px solid var(--j-hairline)", marginTop: 8, paddingTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div className="j-avatar">{initials}</div>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName || "User"}</div>
                <div style={{ fontSize: 11.5, color: "oklch(0.6 0 0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.primaryEmail}</div>
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
