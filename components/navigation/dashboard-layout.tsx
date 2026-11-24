"use client"

import { useState, useEffect, useCallback } from "react"
import { useInboxCount } from "@/lib/inbox/live"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { PullToRefresh } from "./PullToRefresh"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { AppSidebar, OPEN_POPOUT_EVENT } from "./app-sidebar"
import { Icon } from "@/components/jarvis/icons"
import { DOCK_STATE_EVENT, DOCK_TOGGLE_EVENT } from "@/components/ade/AssistantDock"
import { REPORT_EVENT } from "@/lib/chat/events"
import { SearchPalette } from "./SearchPalette"
import { DOCK_MIN_VIEWPORT, dockAllowed } from "@/lib/ade/dock"

/**
 * Every page, by address: its name in the top bar, and its line in the jump box. Kept in step with the menu
 * (app-sidebar.tsx): a page in the menu that is missing here has no title and cannot be jumped to.
 * `jump: false` is an address that shows a page already listed under another one.
 */
const PAGE_META: Record<string, { title: string; sub: string; jump?: false }> = {
  "/dashboard": { title: "Dashboard", sub: "Across every project" },
  "/projects": { title: "Projects", sub: "All ventures and initiatives" },
  "/todos": { title: "Today", sub: "Daily focus and tasks" },
  "/inbox": { title: "Inbox", sub: "Questions waiting on you" },
  "/calendar": { title: "Calendar", sub: "Schedule and events" },
  "/ideas": { title: "Ideas", sub: "Capture and refine new ideas" },
  "/memory": { title: "Memory", sub: "Knowledge base and notes" },
  "/library": { title: "Library", sub: "SOPs, process maps, skills and templates" },
  "/sops": { title: "Library", sub: "SOPs, process maps, skills and templates", jump: false },
  "/catalog": { title: "Catalog", sub: "What the product is made of" },
  "/agents": { title: "Agents", sub: "AI worker jobs and status" },
  "/clients": { title: "Clients", sub: "Ongoing client work and retainers" },
  "/finance": { title: "Finance", sub: "Money across your projects" },
  "/chat": { title: "Assistant", sub: "Talk to the planner" },
  "/settings": { title: "Settings", sub: "Preferences and configuration" },
  // Pages that are in no menu: listing them here gives each its title and a way in from the jump box.
  "/graph": { title: "Knowledge graph", sub: "How ideas, tasks and documents connect" },
  "/impact": { title: "Impact graph", sub: "What depends on what in the code" },
  "/feedback": { title: "Feedback", sub: "Comments left by pointing at a screen" },
}
/** A page under another one (an idea, a Library section) carries that page's title rather than the product's name. */
const PARENT_META: [string, { title: string; sub: string }][] = [
  ["/project/", { title: "Project", sub: "" }],
  ["/ideas/", { title: "Ideas", sub: "" }],
  ["/library/", { title: "Library", sub: "" }],
  ["/chat/", { title: "Assistant", sub: "" }],
]
/** The pages the jump box offers for what has been typed: every word typed must appear in the name or its line. */
const jumpTo = (typed: string) => {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean)
  return Object.entries(PAGE_META).filter(([, m]) => m.jump !== false && words.every((w) => `${m.title} ${m.sub}`.toLowerCase().includes(w)))
}

interface DashboardLayoutProps {
  children: React.ReactNode
  noPad?: boolean
  /** On phones the page supplies its own header (the chat does), so the app top bar is hidden. */
  hideTopbarOnPhone?: boolean
}


// Phone bottom tabs (same shape as the Dzidzor/BYB phone app): the agent is the centre tab.
const PHONE_TABS = [
  { href: "/todos", label: "Today", icon: "check" as const },
  { href: "/projects", label: "Projects", icon: "folder" as const },
  { href: "/chat", label: "Ask", icon: "sparkle" as const, center: true },
  { href: "/inbox", label: "Inbox", icon: "msg" as const },
]

type Viewport = "mobile" | "tablet" | "desktop"

function viewportFor(width: number): Viewport {
  return width <= 768 ? "mobile" : width <= 1100 ? "tablet" : "desktop"
}

export const OPEN_MENU_EVENT = "app:open-menu"

export function DashboardLayout({ children, noPad, hideTopbarOnPhone }: DashboardLayoutProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  // No Mac hint: the owner does not use a Mac (report 879b5a6d, 2026-11-23: "I dot have or use a Mac"), and a guess at the
  // platform showed one anyway. The shortcut itself still answers to Ctrl or Cmd with K.
  useEffect(() => { setThemeReady(true) }, [])
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // The assistant dock takes the left of the screen: the planner nav folds to its icon rail beside it.
  const [dockOpen, setDockOpen] = useState(false)
  useEffect(() => {
    // Pages remount on navigation, after the dock last announced itself: ask the page, then listen.
    setDockOpen(document.body.classList.contains("ade-open"))
    const on = (e: Event) => setDockOpen(!!(e as CustomEvent<{ open: boolean }>).detail?.open)
    window.addEventListener(DOCK_STATE_EVENT, on)
    return () => window.removeEventListener(DOCK_STATE_EVENT, on)
  }, [])
  // Deterministic on first render (SSR + hydration); corrected on mount.
  const [vp, setVp] = useState<Viewport>("desktop")
  const pathname = usePathname()
  // Swipe down to refresh (phone): the page is mounted again, so it reads everything again, and the server parts are
  // asked for again. No full reload: the shell, the theme and the assistant stay as they are.
  const router = useRouter()
  const [refreshN, setRefreshN] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshPage = useCallback(() => {
    setRefreshing(true)
    setRefreshN((n) => n + 1)
    router.refresh()
    window.setTimeout(() => setRefreshing(false), 900)
  }, [router])
  // How many things wait on the owner: shown on the phone's Inbox tab.
  const waitingCount = useInboxCount(pathname)

  const meta = PAGE_META[pathname] || PARENT_META.find(([p]) => pathname.startsWith(p))?.[1] || { title: "Planner", sub: "" }

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

  // Pages that own the phone header ask for the menu through this event.
  useEffect(() => {
    const open = () => setMobileOpen(true)
    window.addEventListener(OPEN_MENU_EVENT, open)
    return () => window.removeEventListener(OPEN_MENU_EVENT, open)
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
  // With the assistant open there is no rail: the header hamburger opens the menu (like Dzidzor and BYB).
  const navHidden = dockOpen && vp === "desktop"

  return (
    <div
      className={
        `j-app${effectiveCollapsed ? " j-collapsed" : ""}${mobileOpen ? " j-drawer-open" : ""}${navHidden ? " j-nav-hidden" : ""}`
      }
      /*
        noPad pages (chat) own their scrolling. .j-app is min-height: 100vh with
        no ceiling, so under noPad it grew to fit its content and the whole page
        scrolled by about the topbar's height. Pin it to the viewport (dvh, so
        mobile browser toolbars are accounted for); the page inside decides what
        scrolls.
      */
      style={noPad ? { height: "100dvh", minHeight: 0, gridTemplateRows: "minmax(0, 1fr)", overflow: "hidden" } : undefined}
    >
      <AppSidebar
        collapsed={effectiveCollapsed}
        onCollapsedChange={setCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        navHidden={navHidden}
      />
      {mobileOpen && (
        <div
          className="j-drawer-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="j-main" style={noPad ? { minHeight: 0, overflow: "hidden" } : undefined}>
        <header className={`j-topbar${hideTopbarOnPhone ? " j-topbar-hide-phone" : ""}`}>
          <div className="j-topbar-left">
            {navHidden && (
              <button
                className="j-btn j-btn-ghost"
                data-ui="nav.hamburger"
                aria-label="Open the menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  window.dispatchEvent(new CustomEvent(OPEN_POPOUT_EVENT, { detail: { left: Math.round(r.left), top: Math.round(r.bottom + 8) } }))
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", minHeight: 36 }}
              >
                <Icon name="list" size={16} />
                <span>Menu</span>
              </button>
            )}
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
              aria-label="Search the planner"
            >
              <Icon name="search" size={14} />
              <span>Search…</span>
              <span className="j-kbd">Ctrl K</span>
            </button>
            <button
              className="j-btn j-btn-icon j-btn-ghost j-search-mobile"
              onClick={() => setCmdOpen(true)}
              title="Search (Ctrl K)"
              aria-label="Search the planner"
            >
              <Icon name="search" size={16} />
            </button>
            {themeReady && (
              <button
                className="opx-ib"
                data-ui="theme.toggle"
                title={resolvedTheme === "dark" ? "Dark mode is on. Switch to light" : "Light mode is on. Switch to dark"}
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {/* Shows the mode you are in: moon in dark, sun in light. */}
                {resolvedTheme === "dark" ? <Moon size={17} strokeWidth={1.9} /> : <Sun size={17} strokeWidth={1.9} />}
              </button>
            )}
            <button
              className="j-btn j-btn-ghost"
              data-ui="dock.toggle"
              onClick={() => window.dispatchEvent(new Event(DOCK_TOGGLE_EVENT))}
              title="Show or hide the assistant"
              // Only where the assistant can open: on /feedback, /chat and the sign-in pages the dock never shows, and the
              // button pressed there did nothing but save "closed" for every other page (check of /feedback, 2026-11-24).
              style={{ display: vp === "desktop" && dockAllowed(pathname, DOCK_MIN_VIEWPORT) ? "inline-flex" : "none", gap: 6, alignItems: "center" }}
            >
              <Icon name="sparkle" size={14} />
              <span>Assistant</span>
            </button>
            {/* Report a problem from any page: pick the part that is wrong, then say what. Right-click was the only way in. */}
            <button
              className="j-btn j-btn-ghost"
              data-ui="report.start"
              onClick={() => window.dispatchEvent(new Event(REPORT_EVENT))}
              title="Point at a part of the page and say what is wrong or what you wish it did"
            >
              {vp === "mobile" ? "Report" : "Report a problem"}
            </button>
            {/* The bell opens the inbox: the questions and notices waiting on you. It used to do nothing. */}
            <Link
              href="/inbox"
              className="j-btn j-btn-icon j-btn-ghost j-bell"
              data-ui="inbox.open"
              title={waitingCount > 0 ? `${waitingCount} waiting on you. Open the inbox` : "Open the inbox"}
              aria-label={waitingCount > 0 ? `Inbox, ${waitingCount} waiting on you` : "Inbox"}
            >
              <Icon name="bell" size={16} />
              {waitingCount > 0 && <span className="j-bell-count" aria-hidden="true">{waitingCount > 99 ? "99+" : waitingCount}</span>}
            </Link>
          </div>
        </header>

        <main style={noPad
          ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }
          : { flex: 1, overflowY: "auto", minHeight: 0 }
        }>
          <div key={refreshN} style={{ display: "contents" }}>{children}</div>
        </main>
        {vp === "mobile" && !pathname.startsWith("/chat") && <PullToRefresh onRefresh={refreshPage} busy={refreshing} />}
      </div>

      {vp === "mobile" && !pathname.startsWith("/chat") && (
        <nav className="j-tabbar" aria-label="Primary">
          {PHONE_TABS.map(t => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/")
            return (
              <Link
                key={t.href}
                href={t.href}
                data-ui={`nav.tab.${t.label.toLowerCase()}`}
                className={`j-tab${t.center ? " j-tab-center" : ""}${active ? " j-tab-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={t.icon} size={t.center ? 20 : 18} />
                <span>{t.label}</span>
                {t.href === "/inbox" && waitingCount > 0 && <span className="j-tab-count" aria-label={`${waitingCount} waiting`}>{waitingCount > 99 ? "99+" : waitingCount}</span>}
              </Link>
            )
          })}
          <button className="j-tab" data-ui="nav.tab.more" onClick={() => setMobileOpen(true)} aria-label="More: open the full menu">
            <Icon name="list" size={18} />
            <span>More</span>
          </button>
        </nav>
      )}

      {/* The top search: pages, projects, tasks, documents, and a row that asks the assistant (SearchPalette). */}
      {cmdOpen && <SearchPalette onClose={() => setCmdOpen(false)} pagesFor={jumpTo} />}
    </div>
  )
}
