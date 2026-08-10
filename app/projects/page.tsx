"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardLayout } from "@/components/navigation"
import { NewProjectModal } from "@/components/projects/NewProjectModal"
import type { ProjectSummary } from "@/lib/types"

type ViewMode = "cards" | "table" | "portfolio" | "phase"
type StatusFilter = "all" | "in_progress" | "planning" | "review" | "on_hold"

const STATUS_LABEL: Record<string, string> = {
  in_progress: "Active",
  planning: "Planning",
  review: "Review",
  on_hold: "On Hold",
  completed: "Done",
}

const STATUS_CLASS: Record<string, string> = {
  in_progress: "j-pos",
  planning: "j-info",
  review: "j-warn",
  on_hold: "j-muted",
  completed: "j-proj",
}

const HEALTH_CLASS: Record<string, string> = {
  excellent: "j-pos",
  good: "j-info",
  attention: "j-warn",
  critical: "j-neg",
}

const PHASE_COLORS: Record<string, string> = {
  Planning: "var(--j-info)",
  Design: "var(--j-biz)",
  Development: "var(--j-accent)",
  Testing: "var(--j-warn)",
  Review: "var(--j-warn)",
  Launch: "var(--j-pos)",
  Done: "var(--j-pos)",
}

function lastActivityLabel(d?: Date | string | null): string {
  if (!d) return "—"
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return "—"
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

function ProjectCard({ p, onClick }: { p: ProjectSummary; onClick: () => void }) {
  return (
    <div className="j-card" style={{ cursor: "pointer", display: "flex", flexDirection: "column" }} onClick={onClick}>
      <div style={{ marginBottom: 10 }}>
        <div className="j-row j-between" style={{ marginBottom: 8 }}>
          <div className="j-row" style={{ gap: 6 }}>
            <span className={`j-pill ${HEALTH_CLASS[p.health]}`}>
              <span className="j-pill-dot" />
              {p.health}
            </span>
            {p.phase && <span className="j-pill j-ghost">{p.phase}</span>}
          </div>
          <span className={`j-pill ${STATUS_CLASS[p.status] || "j-muted"}`}>
            {STATUS_LABEL[p.status] || p.status}
          </span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          {p.name}
        </h3>
        {p.description && (
          <p className="j-muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
            {p.description}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div className="j-row j-between" style={{ marginBottom: 5 }}>
          <span className="j-muted" style={{ fontSize: 11 }}>Progress</span>
          <span className="j-num" style={{ fontSize: 11 }}>{p.progress}%</span>
        </div>
        <div className="j-progress"><span style={{ width: `${p.progress}%` }} /></div>
      </div>

      {p.techStack && p.techStack.length > 0 && (
        <div className="j-row j-wrap" style={{ gap: 4, marginBottom: 10 }}>
          {p.techStack.slice(0, 4).map(t => (
            <span key={t} className="j-pill j-ghost" style={{ fontSize: 10, padding: "1px 7px" }}>{t}</span>
          ))}
          {p.techStack.length > 4 && (
            <span className="j-pill j-ghost" style={{ fontSize: 10, padding: "1px 7px" }}>+{p.techStack.length - 4}</span>
          )}
        </div>
      )}

      <div className="j-row j-between" style={{ borderTop: "1px solid var(--j-hairline)", paddingTop: 10, marginTop: "auto" }}>
        <div className="j-col" style={{ gap: 0 }}>
          <span className="j-num" style={{ fontSize: 12 }}>{p.completedTasks}/{p.totalTasks}</span>
          <span className="j-muted" style={{ fontSize: 10 }}>tasks · {p.activeAgents} agents</span>
        </div>
        <div className="j-col" style={{ gap: 0, textAlign: "right" }}>
          <span className="j-num" style={{ fontSize: 12 }}>{lastActivityLabel(p.lastActivity)}</span>
          <span className="j-muted" style={{ fontSize: 10 }}>last activity</span>
        </div>
      </div>
    </div>
  )
}

function ProjectsTable({ projects, onOpen }: { projects: ProjectSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className="j-card" style={{ padding: 0 }}>
      <table className="j-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Phase</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Tasks</th>
            <th>Agents</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpen(p.id)}>
              <td>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                {p.description && (
                  <div className="j-muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {p.description.slice(0, 64)}{p.description.length > 64 ? "…" : ""}
                  </div>
                )}
              </td>
              <td>
                <span className="j-pill j-ghost">{p.phase || "—"}</span>
              </td>
              <td>
                <span className={`j-pill ${STATUS_CLASS[p.status] || "j-muted"}`}>
                  <span className="j-pill-dot" />
                  {STATUS_LABEL[p.status] || p.status}
                </span>
              </td>
              <td>
                <div className="j-row" style={{ gap: 8, alignItems: "center" }}>
                  <div className="j-progress" style={{ flex: 1, minWidth: 80 }}>
                    <span style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="j-num" style={{ fontSize: 11, minWidth: 28, textAlign: "right" }}>{p.progress}%</span>
                </div>
              </td>
              <td className="j-num" style={{ fontSize: 12 }}>{p.completedTasks}/{p.totalTasks}</td>
              <td className="j-muted j-num" style={{ fontSize: 12 }}>{p.activeAgents}</td>
              <td>
                <span className={`j-pill ${HEALTH_CLASS[p.health] || "j-muted"}`}>
                  <span className="j-pill-dot" />
                  {p.health}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProjectsPortfolio({ projects, onOpen }: { projects: ProjectSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className="j-col" style={{ gap: 8 }}>
      {projects.map(p => {
        const barColor = PHASE_COLORS[p.phase || ""] || "var(--j-accent)"
        return (
          <div
            key={p.id}
            className="j-card"
            style={{ padding: "14px 18px", cursor: "pointer", display: "flex", gap: 16, alignItems: "center" }}
            onClick={() => onOpen(p.id)}
          >
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: barColor, flexShrink: 0 }} />

            <div style={{ flex: "0 0 220px", minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{p.name}</div>
              <div className="j-row" style={{ gap: 6 }}>
                <span className={`j-pill ${STATUS_CLASS[p.status] || "j-muted"}`} style={{ fontSize: 10 }}>
                  {STATUS_LABEL[p.status] || p.status}
                </span>
                {p.phase && <span className="j-pill j-ghost" style={{ fontSize: 10 }}>{p.phase}</span>}
              </div>
            </div>

            <div style={{ flex: "0 0 180px" }}>
              <div className="j-row j-between" style={{ marginBottom: 5 }}>
                <span className="j-muted" style={{ fontSize: 10 }}>Progress</span>
                <span className="j-num" style={{ fontSize: 10 }}>{p.progress}%</span>
              </div>
              <div className="j-progress"><span style={{ width: `${p.progress}%` }} /></div>
            </div>

            <div style={{ flex: "0 0 100px", textAlign: "center" }}>
              <div className="j-num" style={{ fontSize: 13 }}>{lastActivityLabel(p.lastActivity)}</div>
              <div className="j-muted" style={{ fontSize: 10 }}>last activity</div>
            </div>

            <div style={{ flex: "0 0 90px", textAlign: "center" }}>
              <div className="j-num" style={{ fontSize: 15, fontWeight: 500 }}>{p.completedTasks}/{p.totalTasks}</div>
              <div className="j-muted" style={{ fontSize: 10 }}>tasks done</div>
            </div>

            <div style={{ flex: "0 0 80px", textAlign: "center" }}>
              <div className="j-num" style={{ fontSize: 13 }}>{p.activeAgents}</div>
              <div className="j-muted" style={{ fontSize: 10 }}>agents</div>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <span className={`j-pill ${HEALTH_CLASS[p.health] || "j-muted"}`}>
                <span className="j-pill-dot" />
                {p.health}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectsByPhase({ projects, onOpen }: { projects: ProjectSummary[]; onOpen: (id: string) => void }) {
  const groups = projects.reduce<Record<string, ProjectSummary[]>>((acc, p) => {
    const key = p.phase || "Unassigned"
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="j-col" style={{ gap: 24 }}>
      {Object.entries(groups).map(([phase, items]) => {
        const avgProg = Math.round(items.reduce((s, p) => s + p.progress, 0) / items.length)
        const color = PHASE_COLORS[phase] || "var(--j-accent)"
        return (
          <div key={phase}>
            <div className="j-row j-between" style={{ marginBottom: 12 }}>
              <div className="j-row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
                <h3 style={{ fontSize: 11, fontWeight: 700, margin: 0, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.708 0 0)" }}>{phase}</h3>
                <span className="j-pill j-ghost" style={{ fontSize: 10 }}>{items.length}</span>
              </div>
              <span className="j-muted" style={{ fontSize: 11 }}>avg {avgProg}% complete</span>
            </div>
            <div className="j-grid j-cols-3">
              {items.map(p => (
                <div
                  key={p.id}
                  className="j-card j-tight"
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpen(p.id)}
                >
                  <div className="j-row j-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                    <span className={`j-pill ${STATUS_CLASS[p.status] || "j-muted"}`} style={{ fontSize: 10 }}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>
                  <div className="j-progress" style={{ marginBottom: 8 }}>
                    <span style={{ width: `${p.progress}%` }} />
                  </div>
                  <div className="j-row j-between">
                    <span className="j-muted" style={{ fontSize: 11 }}>{p.completedTasks}/{p.totalTasks} tasks</span>
                    <span className={`j-pill ${HEALTH_CLASS[p.health] || "j-muted"}`} style={{ fontSize: 10 }}>
                      <span className="j-pill-dot" />{p.health}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_FILTERS: { id: StatusFilter | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Active" },
  { id: "planning", label: "Planning" },
  { id: "review", label: "Review" },
  { id: "on_hold", label: "On Hold" },
]

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "table", label: "Table" },
  { id: "portfolio", label: "Portfolio" },
  { id: "phase", label: "By Phase" },
]

export default function ProjectsPage() {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>("cards")
  const [filter, setFilter] = useState<StatusFilter | "all">("all")
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [filter])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      const url = filter === "all" ? "/api/projects" : `/api/projects?status=${filter}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()
      setProjects(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }

  const openProject = (id: string) => router.push(`/project/${id}`)

  const total = projects.length
  const active = projects.filter(p => p.status === "in_progress").length
  const atRisk = projects.filter(p => p.health === "attention" || p.health === "critical").length
  const avgProgress = total ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / total) : 0

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Breadcrumbs — wayfinding, esp. on mobile (feedback #2) */}
        <nav aria-label="Breadcrumb" className="j-row j-wrap" style={{ gap: 6, fontSize: 12 }}>
          <Link href="/dashboard" className="j-muted" style={{ textDecoration: "none" }}>Dashboard</Link>
          <span className="j-muted" aria-hidden="true">›</span>
          <span aria-current="page">Projects</span>
        </nav>

        {/* Header action — pulled out of the stat bar so it no longer
            stretches the row and forces horizontal page scroll on mobile
            (feedback #1) */}
        <div className="j-row j-between j-wrap" style={{ gap: 10 }}>
          <span className="j-muted" style={{ fontSize: 13 }}>All ventures and initiatives</span>
          <button
            className="j-btn j-btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => setIsNewProjectModalOpen(true)}
          >
            + New project
          </button>
        </div>

        {/* Stat strip — responsive grid (4 / 2 / 1 cols), contained on
            mobile so the whole page no longer scrolls sideways (feedback #1) */}
        <div className="j-grid j-cols-4">
          {[
            { label: "Total", value: total, cls: "" },
            { label: "Active", value: active, cls: "j-pos" },
            { label: "At risk", value: atRisk, cls: atRisk > 0 ? "j-warn" : "j-muted" },
            { label: "Avg progress", value: `${avgProgress}%`, cls: "j-info" },
          ].map(s => (
            <div key={s.label} className="j-card j-tight" style={{ padding: "12px 16px" }}>
              <div className="j-eyebrow">{s.label}</div>
              <div className={`j-num ${s.cls}`} style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filter chips + view mode tabs */}
        <div className="j-row j-between j-wrap" style={{ gap: 8 }}>
          <div className="j-row j-wrap" style={{ gap: 6 }}>
            {STATUS_FILTERS.map(f => {
              const count = f.id === "all" ? total : projects.filter(p => p.status === f.id).length
              const active = filter === f.id
              return (
                <button
                  key={f.id}
                  className={`j-pill ${active ? "j-proj" : "j-ghost"}`}
                  style={active ? { background: "oklch(0.870 0.045 252 / 0.18)", color: "oklch(0.985 0 0)", boxShadow: "none" } : {}}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="j-muted" style={{ fontSize: 10, marginLeft: 4 }}>{count}</span>
                </button>
              )
            })}
          </div>
          <div className="j-tabs">
            {VIEW_MODES.map(m => (
              <button
                key={m.id}
                className={`j-tab${view === m.id ? " j-active" : ""}`}
                onClick={() => setView(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 240 }}>
            <span className="j-muted">Loading projects…</span>
          </div>
        ) : error ? (
          <div className="j-card" style={{ textAlign: "center", padding: 40 }}>
            <div className="j-muted" style={{ marginBottom: 12 }}>{error}</div>
            <button className="j-btn j-btn-ghost" onClick={fetchProjects}>Try again</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="j-card" style={{ textAlign: "center", padding: 48 }}>
            <div style={{ marginBottom: 12 }}>No projects yet.</div>
            <button className="j-btn j-btn-primary" onClick={() => setIsNewProjectModalOpen(true)}>
              + Create your first project
            </button>
          </div>
        ) : (
          <>
            {view === "cards" && (
              <div className="j-grid j-cols-3">
                {projects.map(p => <ProjectCard key={p.id} p={p} onClick={() => openProject(p.id)} />)}
              </div>
            )}
            {view === "table" && <ProjectsTable projects={projects} onOpen={openProject} />}
            {view === "portfolio" && <ProjectsPortfolio projects={projects} onOpen={openProject} />}
            {view === "phase" && <ProjectsByPhase projects={projects} onOpen={openProject} />}
          </>
        )}
      </div>

      <NewProjectModal
        open={isNewProjectModalOpen}
        onOpenChange={setIsNewProjectModalOpen}
        onProjectCreated={fetchProjects}
      />
    </DashboardLayout>
  )
}
