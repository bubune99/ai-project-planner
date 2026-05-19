"use client"

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
      { title: "Today", href: "/todos", icon: "target" },
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
}

export function AppSidebar({
  collapsed = false,
  onCollapsedChange,
  mobileOpen = false,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname()
  const user = useUser()

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  return (
    <div
      className={`j-sidebar${collapsed ? " j-collapsed" : ""}${mobileOpen ? " j-mobile-open" : ""}`}
    >
      {/* Brand */}
      <div className="j-brand" style={collapsed ? { justifyContent: "center", padding: "6px 0 14px" } : {}}>
        <div className="j-brand-mark">J</div>
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
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`j-nav-item${isActive ? " j-active" : ""}`}
                style={collapsed ? { justifyContent: "center", padding: "9px 0" } : {}}
                title={collapsed ? item.title : undefined}
              >
                <span className="j-nav-icon">
                  <Icon name={item.icon} size={16} />
                </span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.title}</span>
                    {item.badge && (
                      <span className={`j-nav-badge${item.soon ? " j-soon" : ""}`}>
                        {item.badge}
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
        onClick={() => onCollapsedChange?.(!collapsed)}
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
    </div>
  )
}
