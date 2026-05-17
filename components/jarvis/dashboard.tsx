"use client"

/**
 * JARVIS dashboard — 100% real data.
 *
 * Every panel reads from the live planner APIs (no mock/seed data):
 *  - /api/dashboard          projects/ideas/todos counts
 *  - /api/finance/summary    real monthly income + cash flow
 *  - /api/dashboard/focus    today's + overdue tasks
 *  - /api/dashboard/activity recent cross-domain activity
 *  - /api/agents/jobs        real agent worker jobs
 *  - /api/projects           project list (momentum / portfolio map)
 *
 * Honest empty states everywhere: when there is no data we say so rather
 * than invent a number or a trend line.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Icon } from "./icons"

// ── Types (subset of the API envelopes we consume) ───────────────────────────

interface DashboardStats {
  projects: { total: number; active: number; completed: number; onHold: number; planning: number; blockedSteps: number }
  ideas: { total: number; seed: number; exploring: number; refined: number; promoted: number }
  todos: { active: number; completed: number; today: number; overdue: number; upcoming: number }
}
interface FinanceSummary {
  monthlyIncome: number
  incomeStreamCount: number
  cashFlow: { income: number; expenses: number; net: number }
  netWorth: { total: number }
}
interface FocusItem {
  id: string
  title: string
  priority?: string
  project?: { id: string; name: string } | null
  urgency: string
}
interface FocusData {
  overdue: FocusItem[]
  today: FocusItem[]
  summary: { overdueCount: number; todayCount: number }
}
interface ActivityItem {
  id: string
  type: "project" | "idea" | "todo" | "transaction" | "decision" | "milestone"
  action: string
  title: string
  description: string | null
  timestamp: string
}
interface AgentJob {
  id: string
  title: string
  status: "running" | "completed" | "failed" | "queued" | "pending" | string
}
interface ProjectRow {
  id: string
  name: string
  status: string
  phase?: string
  progress: number
  completedTasks: number
  totalTasks: number
}

interface DashData {
  stats: DashboardStats | null
  finance: FinanceSummary | null
  focus: FocusData | null
  activity: ActivityItem[]
  agents: AgentJob[]
  projects: ProjectRow[]
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { credentials: "include" })
    if (!r.ok) return null
    const j = await r.json()
    return j?.data ?? null
  } catch {
    return null
  }
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

// ── Small presentational atoms ───────────────────────────────────────────────

function SparkRail({ data }: { data: number[] }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  return (
    <div className="j-spark-rail">
      {data.map((v, i) => (
        <span
          key={i}
          className={v === max ? "j-hi" : ""}
          style={{ height: `${Math.round((v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="j-muted" style={{ fontSize: 12, padding: "10px 2px" }}>
      {children}
    </div>
  )
}

// ── Vital signs (real counts; income from finance summary) ───────────────────

function VitalSigns({ d }: { d: DashData }) {
  const projects = d.projects
  const active = projects.filter(p => p.status === "in_progress" || p.status === "active")
  const momentum = active.length
    ? Math.round(active.reduce((s, p) => s + (p.progress || 0), 0) / active.length)
    : 0
  const income = d.finance?.monthlyIncome ?? 0
  const net = d.finance?.cashFlow?.net ?? 0

  const tiles = [
    {
      l: "Active projects",
      v: d.stats?.projects.active ?? active.length,
      s: `${d.stats?.projects.total ?? projects.length} total`,
      spark: active.map(p => p.progress || 0),
    },
    {
      l: "Open ideas",
      v: d.stats?.ideas.total ?? 0,
      s: `${d.stats?.ideas.promoted ?? 0} promoted`,
      spark: d.stats
        ? [d.stats.ideas.seed, d.stats.ideas.exploring, d.stats.ideas.refined, d.stats.ideas.promoted].filter(n => n > 0)
        : [],
    },
    {
      l: "Momentum index",
      v: `${momentum}/100`,
      s: "avg active progress",
      spark: active.map(p => p.progress || 0),
    },
    {
      l: "Monthly income",
      v: `$${(income / 1000).toFixed(1)}K`,
      s:
        d.finance == null
          ? "finance not connected"
          : income > 0
            ? `${d.finance.incomeStreamCount} income stream${d.finance.incomeStreamCount === 1 ? "" : "s"} · net $${(net / 1000).toFixed(1)}K`
            : "no income streams yet",
      spark: [] as number[],
    },
  ]

  return (
    <div className="j-grid j-cols-4">
      {tiles.map(t => (
        <div key={t.l} className="j-card j-tight">
          <div className="j-eyebrow">{t.l}</div>
          <div className="j-row j-between" style={{ marginTop: 8, alignItems: "flex-end" }}>
            <div className="j-amount-lg j-num">{t.v}</div>
            <SparkRail data={t.spark} />
          </div>
          <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>{t.s}</div>
        </div>
      ))}
    </div>
  )
}

// ── Today's focus — real tasks, whole card links to /todos (feedback #4) ──────

function FocusMode({ d }: { d: DashData }) {
  const focus = d.focus
  const items = focus ? [...focus.overdue, ...focus.today].slice(0, 5) : []
  const completed = d.stats?.todos.completed ?? 0
  const activeCount = d.stats?.todos.active ?? 0
  const totalKnown = completed + activeCount
  const pct = totalKnown ? Math.round((completed / totalKnown) * 100) : 0

  return (
    <Link
      href="/todos"
      className="j-focus-mode"
      title="Open your to-do list"
      style={{ display: "block", color: "inherit", textDecoration: "none", cursor: "pointer" }}
    >
      <div className="j-row j-between" style={{ marginBottom: 20 }}>
        <div>
          <div className="j-eyebrow">Today&apos;s Focus</div>
          <h2 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>
            {completed}/{totalKnown} tasks complete
          </h2>
        </div>
        <div className="j-col" style={{ alignItems: "flex-end", gap: 4 }}>
          <span className="j-pill j-pos"><span className="j-pill-dot" />{pct}%</span>
          <span className="j-muted" style={{ fontSize: 12 }}>open the list →</span>
        </div>
      </div>
      <div className="j-progress j-thick" style={{ marginBottom: 20 }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="j-col j-gap-2">
        {items.length === 0 ? (
          <Empty>
            {d.focus == null ? "Couldn’t load tasks." : "Nothing overdue or due today — you’re clear."}
          </Empty>
        ) : (
          items.map(t => (
            <div key={t.id} className="j-row" style={{ gap: 10, padding: "8px 12px", background: "oklch(1 0 0 / 0.04)", borderRadius: 8 }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: t.urgency === "overdue" ? "var(--j-neg)" : "var(--j-warn)",
                }}
              />
              <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              {t.project && <span className="j-pill j-proj">{t.project.name}</span>}
            </div>
          ))
        )}
      </div>
    </Link>
  )
}

// ── Portfolio progress (real projects, no invented dates) ────────────────────

function PortfolioStrip({ d }: { d: DashData }) {
  const active = d.projects
    .filter(p => p.status === "in_progress" || p.status === "active")
    .slice(0, 6)

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div>
          <p className="j-card-title">Portfolio Progress</p>
          <p className="j-card-sub">Active ventures by completion</p>
        </div>
        <Link href="/projects" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>
          View all <Icon name="arrow" size={12} />
        </Link>
      </div>
      {active.length === 0 ? (
        <Empty>No active projects yet.</Empty>
      ) : (
        <div className="j-col j-gap-3">
          {active.map(p => (
            <div key={p.id} className="j-row j-between" style={{ gap: 12 }}>
              <div className="j-row" style={{ gap: 8, flex: "0 0 40%", minWidth: 0 }}>
                {p.phase && <span className="j-pill j-muted" style={{ flexShrink: 0 }}>{p.phase}</span>}
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </div>
              <div className="j-progress" style={{ flex: 1 }}>
                <span style={{ width: `${p.progress}%` }} />
              </div>
              <span className="j-muted j-num" style={{ fontSize: 11, minWidth: 32, textAlign: "right" }}>
                {p.progress}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Portfolio map (real projects grouped by status — replaces fake graph) ────

function PortfolioMap({ d }: { d: DashData }) {
  const groups: { key: string; label: string; color: string }[] = [
    { key: "planning", label: "Planning", color: "var(--j-info)" },
    { key: "in_progress", label: "Active", color: "var(--j-accent)" },
    { key: "review", label: "Review", color: "var(--j-warn)" },
    { key: "on_hold", label: "On hold", color: "var(--j-muted)" },
    { key: "completed", label: "Done", color: "var(--j-pos)" },
  ]
  const norm = (s: string) => (s === "active" ? "in_progress" : s)

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div>
          <p className="j-card-title">Portfolio Map</p>
          <p className="j-card-sub">Projects by lifecycle stage</p>
        </div>
      </div>
      {d.projects.length === 0 ? (
        <Empty>No projects to map yet.</Empty>
      ) : (
        <div className="j-col j-gap-3">
          {groups.map(g => {
            const items = d.projects.filter(p => norm(p.status) === g.key)
            if (items.length === 0) return null
            return (
              <div key={g.key}>
                <div className="j-row" style={{ gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color, display: "inline-block" }} />
                  <span className="j-eyebrow">{g.label}</span>
                  <span className="j-pill j-ghost" style={{ fontSize: 10 }}>{items.length}</span>
                </div>
                <div className="j-row j-wrap" style={{ gap: 6 }}>
                  {items.map(p => (
                    <Link
                      key={p.id}
                      href={`/project/${p.id}`}
                      className="j-pill j-ghost"
                      style={{ fontSize: 11, textDecoration: "none", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {p.name} · {p.progress}%
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Project momentum (real progress, no fake spark) ──────────────────────────

function ProjectMomentum({ d }: { d: DashData }) {
  const active = d.projects
    .filter(p => p.status === "in_progress" || p.status === "active")
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 4)
  return (
    <div className="j-card">
      <div className="j-card-head">
        <p className="j-card-title">Momentum</p>
        <Link href="/projects" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>
          View all <Icon name="arrow" size={12} />
        </Link>
      </div>
      {active.length === 0 ? (
        <Empty>No active projects.</Empty>
      ) : (
        <div className="j-col j-gap-3">
          {active.map(p => (
            <div key={p.id} className="j-col" style={{ gap: 2 }}>
              <div className="j-row j-between">
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <span className="j-muted j-num" style={{ fontSize: 11 }}>
                  {p.completedTasks}/{p.totalTasks}
                </span>
              </div>
              <div className="j-progress" style={{ marginTop: 2 }}>
                <span style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CalendarMini() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)
  const monthName = today.toLocaleString("default", { month: "long" })

  return (
    <div className="j-card j-tight">
      <div className="j-card-head" style={{ marginBottom: 10 }}>
        <p className="j-card-title">{monthName} {year}</p>
        <Link href="/calendar" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>
          <Icon name="cal" size={14} />
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(dd => (
          <div key={dd} className="j-eyebrow" style={{ textAlign: "center", padding: "2px 0" }}>{dd}</div>
        ))}
      </div>
      <div className="j-cal-grid">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`j-cal-day${!day ? " j-outside" : ""}${day === today.getDate() ? " j-today" : ""}`}
          >
            {day || ""}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Recent activity (real, feedback #6) ──────────────────────────────────────

function ActivityRail({ d }: { d: DashData }) {
  const iconMap: Record<string, "bolt" | "play" | "check" | "bulb" | "book"> = {
    project: "play", idea: "bulb", todo: "check", transaction: "bolt", decision: "book", milestone: "bolt",
  }
  const colorMap: Record<string, string> = {
    project: "var(--j-accent)", idea: "var(--j-idea)", todo: "var(--j-pos)",
    transaction: "var(--j-warn)", decision: "var(--j-muted)", milestone: "var(--j-info)",
  }
  return (
    <div className="j-card">
      <div className="j-card-head">
        <p className="j-card-title">Recent Activity</p>
      </div>
      {d.activity.length === 0 ? (
        <Empty>No recent activity yet.</Empty>
      ) : (
        <div className="j-col j-gap-2">
          {d.activity.map(a => (
            <div key={a.id} className="j-row" style={{ gap: 10, alignItems: "flex-start" }}>
              <div style={{ color: colorMap[a.type] || "white", flexShrink: 0, marginTop: 1 }}>
                <Icon name={iconMap[a.type] || "bolt"} size={14} />
              </div>
              <div className="j-col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{a.title}</span>
                <span className="j-muted" style={{ fontSize: 11 }}>
                  {(a.description ? a.description + " · " : "") + relTime(a.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Agents (real jobs, feedback #5) ──────────────────────────────────────────

function AgentRail({ d }: { d: DashData }) {
  const statusColor: Record<string, string> = {
    running: "var(--j-pos)", completed: "var(--j-info)", failed: "var(--j-neg)",
    queued: "var(--j-warn)", pending: "var(--j-warn)",
  }
  return (
    <div className="j-card j-tight">
      <div className="j-card-head">
        <p className="j-card-title">Agents</p>
        <Link href="/agents" style={{ fontSize: 12, color: "var(--j-accent)", textDecoration: "none" }}>All</Link>
      </div>
      {d.agents.length === 0 ? (
        <Empty>No agent jobs yet.</Empty>
      ) : (
        <div className="j-col j-gap-2">
          {d.agents.map(a => (
            <div key={a.id} className="j-row j-between">
              <div className="j-row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                {a.status === "running" ? (
                  <div className="j-dot-pulse" />
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[a.status] || "var(--j-muted)" }} />
                )}
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.title}
                </span>
              </div>
              <span className="j-pill j-muted">{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuickCapture() {
  return (
    <div className="j-card" style={{ padding: 16 }}>
      <textarea
        placeholder="/idea · /todo · /note · /decision — capture instantly"
        style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 13, lineHeight: 1.5, height: 44, color: "oklch(0.860 0 0)", fontFamily: "inherit" }}
      />
      <div className="j-row j-between" style={{ marginTop: 8 }}>
        <div className="j-row j-gap-2">
          {["/idea","/todo","/note","/decision"].map(c => (
            <span key={c} className="j-pill j-ghost" style={{ fontSize: 10 }}>{c}</span>
          ))}
        </div>
        <button className="j-btn j-btn-primary">Capture ↵</button>
      </div>
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function JarvisDashboard() {
  const [d, setD] = useState<DashData | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [stats, finance, focus, activity, agents, projects] = await Promise.all([
        getJson("/api/dashboard"),
        getJson("/api/finance/summary"),
        getJson("/api/dashboard/focus"),
        getJson("/api/dashboard/activity?limit=8"),
        getJson("/api/agents/jobs?limit=6"),
        getJson("/api/projects"),
      ])
      if (cancelled) return
      setD({
        stats: stats ?? null,
        finance: finance ?? null,
        focus: focus ?? null,
        activity: Array.isArray(activity) ? activity : [],
        agents: Array.isArray(agents) ? agents : [],
        projects: Array.isArray(projects) ? projects : [],
      })
    })()
    return () => { cancelled = true }
  }, [])

  if (!d) {
    return (
      <div className="j-content">
        <div style={{ display: "grid", placeItems: "center", minHeight: 320 }}>
          <span className="j-muted">Loading dashboard…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="j-content">
      <VitalSigns d={d} />
      <FocusMode d={d} />
      <div className="j-split">
        <div className="j-col j-gap-4">
          <PortfolioStrip d={d} />
          <PortfolioMap d={d} />
        </div>
        <div className="j-col j-gap-4">
          <ProjectMomentum d={d} />
          <CalendarMini />
          <AgentRail d={d} />
          <ActivityRail d={d} />
        </div>
      </div>
      <QuickCapture />
    </div>
  )
}
