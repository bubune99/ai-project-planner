"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from "@/components/navigation"
import { KanbanView } from "@/components/views/KanbanView"
import { transformStepsToPhases } from "@/lib/data-transforms"
import { ActivityFeed } from "@/components/project/activity-feed"
import { Seg } from "@/components/project/opx/shared"
import { TaskList, TaskTimeline, TaskCalendar } from "@/components/project/opx/TaskViews"
import { DocsTab } from "@/components/project/opx/DocsTab"
import { IdeasDecisions } from "@/components/project/opx/IdeasDecisions"
import { MetricsTab, MoneyTab, SettingsTab, uiOf } from "@/components/project/opx/ProjectTabs"

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

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "tasks",      label: "Tasks" },
  { id: "docs",       label: "Docs & files" },
  { id: "decisions",  label: "Ideas & decisions" },
  { id: "metrics",    label: "Metrics" },
  { id: "finance",    label: "Money" },
  { id: "settings",   label: "Settings" },
]

interface ProjectData {
  project: any
  steps: any[]
  techStack: any[]
  businessContext: any
  currentPhase: any
  progressNotes: any[]
  versions: any[]
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewFacet({ project, projectId, phases, onProjectChange }: { project: any; projectId: string; phases: any[]; onProjectChange: () => void }) {
  const health = project.health || "good"
  const kpis = [
    { l: "Progress",      v: `${project.progress || 0}%`,                                   t: project.progress >= 80 ? "j-pos" : project.progress >= 40 ? "j-info" : "j-muted" },
    { l: "Tasks done",    v: `${project.completed_tasks || 0} / ${project.total_tasks || 0}`, t: "j-info" },
    { l: "Active agents", v: `${project.active_agents || 0}`,                                t: "j-proj" },
    { l: "Health",        v: health,                                                          t: HEALTH_CLASS[health] || "j-info" },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {kpis.map(k => (
          <div key={k.l} className="j-card j-tight" style={{ padding: 16 }}>
            <div className="j-eyebrow">{k.l}</div>
            <div className="j-amount-lg" style={{ marginTop: 8 }}>{k.v}</div>
            <span className={`j-pill ${k.t}`} style={{ marginTop: 8 }}>{k.l}</span>
          </div>
        ))}
      </div>

      <PhaseStrip phases={phases} />

      {project.description && (
        <div className="j-card">
          <div className="j-card-head"><div><h3 className="j-card-title">About</h3></div></div>
          <p className="j-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{project.description}</p>
          {(project.tech_stack || []).length > 0 && (
            <div className="j-row j-wrap" style={{ marginTop: 14, gap: 6 }}>
              {(project.tech_stack as string[]).map((t) => (
                <span key={t} className="j-pill j-ghost" style={{ fontSize: 11 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <RisksFacet projectId={projectId} project={project} onChange={onProjectChange} compact />
      <ActivityFeed projectId={projectId} />
    </div>
  )
}

// ─── Phase strip (was the Roadmap tab) ───────────────────────────────────────

/*
  The Roadmap tab was retired 2026-10-03 and its one useful part folded into
  Overview. Across 38 projects, 14 had no phases and 21 had exactly one — so for
  35 of them the tab drew a single circle restating the progress figure already
  on Overview. Only multi-phase projects (Mission Control, @cncpt/cms) had
  anything to show. This renders only for those, and returns null otherwise,
  so a one-phase project does not get a one-dot timeline.
*/
function PhaseStrip({ phases }: { phases: any[] }) {
  if (!phases || phases.length < 2) return null
  const isDone = (p: any) => p.status === "done" || p.status === "completed"
  const isActive = (p: any) => p.status === "in_progress" || p.status === "in-progress" || p.status === "active"
  const done = phases.filter(isDone).length
  const active = phases.filter(isActive).length
  const fillPct = Math.max(0, ((done + active * 0.5) / phases.length) * 100)

  return (
    <div className="j-card">
      <div className="j-card-head">
        <div>
          <h3 className="j-card-title">Phases</h3>
          <p className="j-card-sub">{done} done · {active} active · {phases.length - done - active} upcoming</p>
        </div>
      </div>
      <div style={{ position: "relative", padding: "4px 0 8px" }}>
        <div style={{ position: "absolute", top: 18, left: 18, right: 18, height: 2, background: "var(--j-hairline)" }} />
        <div style={{ position: "absolute", top: 18, left: 18, width: `calc(${fillPct}% - 18px)`, height: 2, background: "var(--j-accent)" }} />
        <div className="j-row" style={{ justifyContent: "space-between", position: "relative" }}>
          {phases.map((ph: any, i: number) => {
            const d = isDone(ph)
            const a = isActive(ph)
            return (
              <div key={ph.id || i} className="j-col" style={{ alignItems: "center", flex: 1, minWidth: 0, gap: 6 }} title={`${ph.name} · ${ph.progress || 0}%`}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: a ? "var(--j-accent)" : d ? "var(--j-pos)" : "oklch(0.180 0 0)",
                  color: a || d ? "oklch(0.110 0.028 268)" : "oklch(0.708 0 0)",
                  display: "grid", placeItems: "center",
                  boxShadow: a ? "0 0 0 4px oklch(0.870 0.045 252 / 0.2), 0 0 0 1px var(--j-ring-strong)" : "0 0 0 1px var(--j-ring-strong)",
                  fontWeight: 600, fontSize: 11,
                }}>
                  {d ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 500, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph.name}</div>
                <span className="j-num j-muted" style={{ fontSize: 10.5 }}>{ph.progress || 0}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Risks ───────────────────────────────────────────────────────────────────

type Risk = {
  id: string
  title: string
  sev: "high" | "med" | "low"
  lik: "high" | "med" | "low"
  owner: string
  mitig: string
  status: "open" | "monitoring" | "mitigating" | "mitigated" | "scheduled"
}

const RISK_SEV_TONE: Record<string, string> = { high: "j-neg", med: "j-warn", low: "j-info" }
const RISK_STATUS_OPTIONS = ["open", "monitoring", "mitigating", "mitigated", "scheduled"] as const

function RisksFacet({ projectId, project, onChange, compact = false }: { projectId: string; project: any; onChange: () => void; compact?: boolean }) {
  const initialRisks: Risk[] = Array.isArray(project?.metadata?.risks) ? project.metadata.risks : []
  const [risks, setRisks] = useState<Risk[]>(initialRisks)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Risk>({
    id: "", title: "", sev: "med", lik: "med", owner: "", mitig: "", status: "open",
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Keep local state in sync with refetched project data
  useEffect(() => {
    if (Array.isArray(project?.metadata?.risks)) setRisks(project.metadata.risks)
  }, [project?.metadata?.risks])

  const persist = async (next: Risk[]) => {
    setSaving(true); setErr(null)
    try {
      const mergedMetadata = { ...(project?.metadata || {}), risks: next }
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: mergedMetadata }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error?.message || j?.error || "Failed to save risk")
      }
      setRisks(next)
      onChange()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save risk")
    } finally {
      setSaving(false)
    }
  }

  const addRisk = async () => {
    if (!form.title.trim()) { setErr("Risk title is required"); return }
    const next: Risk[] = [
      ...risks,
      { ...form, id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `r-${Date.now()}` },
    ]
    await persist(next)
    if (!err) {
      setForm({ id: "", title: "", sev: "med", lik: "med", owner: "", mitig: "", status: "open" })
      setShowForm(false)
    }
  }

  const updateStatus = async (id: string, status: Risk["status"]) => {
    await persist(risks.map(r => r.id === id ? { ...r, status } : r))
  }

  const removeRisk = async (id: string) => {
    if (!confirm("Delete this risk?")) return
    await persist(risks.filter(r => r.id !== id))
  }

  const counts = {
    high: risks.filter(r => r.sev === "high" && r.status !== "mitigated").length,
    med:  risks.filter(r => r.sev === "med"  && r.status !== "mitigated").length,
    low:  risks.filter(r => r.sev === "low"  && r.status !== "mitigated").length,
    mitigated: risks.filter(r => r.status === "mitigated").length,
  }

  return (
    <div className="j-col j-gap-4">
      {!compact && (
        <div className="j-grid j-cols-4">
          {[
            ["High", counts.high, "j-neg"],
            ["Medium", counts.med, "j-warn"],
            ["Low", counts.low, "j-info"],
            ["Mitigated", counts.mitigated, "j-pos"],
          ].map(([l, v]) => (
            <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
              <div className="j-eyebrow">{l}</div>
              <div className="j-amount-lg" style={{ marginTop: 6 }}>{v as number}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="j-card">
          <div className="j-col j-gap-3">
            <input className="j-search" placeholder="Risk title *" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <div className="j-row j-gap-2">
              <select className="j-search" value={form.sev}
                onChange={e => setForm(f => ({ ...f, sev: e.target.value as Risk["sev"] }))}>
                <option value="high">severity: high</option>
                <option value="med">severity: medium</option>
                <option value="low">severity: low</option>
              </select>
              <select className="j-search" value={form.lik}
                onChange={e => setForm(f => ({ ...f, lik: e.target.value as Risk["lik"] }))}>
                <option value="high">likelihood: high</option>
                <option value="med">likelihood: medium</option>
                <option value="low">likelihood: low</option>
              </select>
              <select className="j-search" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as Risk["status"] }))}>
                {RISK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="j-row j-gap-2">
              <input className="j-search" style={{ flex: 1 }} placeholder="Owner (optional)"
                value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
              <input className="j-search" style={{ flex: 2 }} placeholder="Mitigation plan (optional)"
                value={form.mitig} onChange={e => setForm(f => ({ ...f, mitig: e.target.value }))} />
            </div>
            {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
            <div className="j-row j-gap-2">
              <button className="j-btn j-btn-primary" onClick={addRisk} disabled={saving}>
                {saving ? "Saving…" : "Add risk"}
              </button>
              <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Risk register</h3>
          <button className="j-btn j-btn-primary" onClick={() => { setShowForm(s => !s); setErr(null) }}>+ New risk</button>
        </div>
        {risks.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>
              No risks tracked yet. Add what could derail this project.
            </p>
          </div>
        ) : (
          <table className="j-table">
            <thead><tr><th>Risk</th><th>Severity</th><th>Likelihood</th><th>Owner</th><th>Mitigation</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.title}</td>
                  <td><span className={`j-pill ${RISK_SEV_TONE[r.sev]}`}>{r.sev}</span></td>
                  <td><span className={`j-pill ${RISK_SEV_TONE[r.lik]}`}>{r.lik}</span></td>
                  <td className="j-muted">{r.owner || "—"}</td>
                  <td className="j-muted" style={{ fontSize: 12 }}>{r.mitig || "—"}</td>
                  <td>
                    <select
                      className="j-search"
                      value={r.status}
                      onChange={e => updateStatus(r.id, e.target.value as Risk["status"])}
                      style={{ fontSize: 11, padding: "2px 6px" }}
                    >
                      {RISK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => removeRisk(r.id)} aria-label="Delete risk">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Tabs retired 2026-10-03, mapped to where their content now lives so links
// already shared keep working: Notes joined the Overview activity feed, Risks
// is a card on Overview, Team and Links are sections of Settings.
// Agents was removed the same day: 0 jobs ever dispatched, and no worker
// drains agent_jobs. The table and MCP tools stay — /inbox builds on them.
const LEGACY_TABS: Record<string, string> = { notes: "overview", risks: "overview", team: "settings", links: "settings", agents: "overview", ideas: "decisions", money: "finance" }

// ─── Task views ──────────────────────────────────────────────────────────────

type TaskView = "board" | "list" | "timeline" | "calendar"
const TASK_VIEWS: TaskView[] = ["board", "list", "timeline", "calendar"]

/*
  Owner 2026-11-13: views come in two pairs. Board and List show the same
  work as cards or rows; Timeline and Calendar show it against dates.
*/
function TaskViewSwitcher({ view, onChange }: { view: TaskView; onChange: (v: TaskView) => void }) {
  return (
    <div className="opx-row" style={{ gap: 8 }}>
      <Seg label="Task view" value={view === "board" || view === "list" ? view : ("" as TaskView)} options={[["board", "Board"], ["list", "List"]]} onChange={onChange} />
      <Seg label="Dated view" value={view === "timeline" || view === "calendar" ? view : ("" as TaskView)} options={[["timeline", "Timeline"], ["calendar", "Calendar"]]} onChange={onChange} />
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProjectDashboardPage() {
  const params  = useParams()
  const router  = useRouter()
  /*
    Tab and view live in the URL. They were plain useState("overview"), so the
    page ignored ?tab= entirely: My Work's "Open on board" link (?tab=tasks&step=)
    landed on Overview, and every refresh reset to Overview too.

    Gantt and Calendar are no longer tabs — they are views of Tasks, since all
    three render the same project_steps. Old ?tab=gantt / ?tab=calendar links
    are mapped onto the matching view so nothing already shared breaks.
  */
  const searchParams = useSearchParams()
  // Settings › Views & defaults; applied once the project has loaded.
  const [ui, setUi] = useState<ReturnType<typeof uiOf>>({})
  const rawTab  = searchParams.get("tab") || ui.defaultTab || "overview"
  const legacyView = rawTab === "gantt" ? "timeline" : rawTab === "calendar" ? "calendar" : null
  const activeTab  = legacyView ? "tasks" : (LEGACY_TABS[rawTab] ?? rawTab)
  const viewParam = searchParams.get("view") as TaskView | null
  const taskView: TaskView = (legacyView || (viewParam && TASK_VIEWS.includes(viewParam) ? viewParam : TASK_VIEWS.includes(ui.defaultTaskView as TaskView) ? ui.defaultTaskView : "board")) as TaskView
  const focusStepId = searchParams.get("step")
  const setUrl = useCallback((next: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) v === null ? q.delete(k) : q.set(k, v)
    router.replace(`?${q.toString()}`, { scroll: false })
  }, [router, searchParams])
  const setActiveTab = useCallback((tab: string) => setUrl({ tab, view: null, step: null }), [setUrl])
  const setTaskView  = useCallback((view: TaskView) => setUrl({ tab: "tasks", view, step: null }), [setUrl])
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const projectId = params.id as string

  const fetchProjectData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true); else setIsRefreshing(true)
      setError(null)
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to fetch project: ${res.status}`)
      }
      const json = await res.json()
      if (json.success && json.data) { setProjectData(json.data); setUi(uiOf(json.data.project)) }
      else throw new Error(json.error?.message || "Failed to fetch project data")
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [projectId])

  useEffect(() => { if (projectId) fetchProjectData() }, [projectId, fetchProjectData])

  const phases = useMemo(() => {
    if (!projectData?.steps) return []
    try { return transformStepsToPhases(projectData.steps) }
    catch { return [] }
  }, [projectData?.steps])

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
          <div className="j-col" style={{ alignItems: "center", gap: 12 }}>
            <div className="j-dot-pulse" style={{ width: 14, height: 14 }} />
            <span className="j-muted" style={{ fontSize: 13 }}>Loading project…</span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !projectData) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
          <div className="j-card" style={{ maxWidth: 420, textAlign: "center" }}>
            <p style={{ color: "var(--j-neg)", marginBottom: 16 }}>{error || "Project not found"}</p>
            <button className="j-btn j-btn-primary" onClick={() => router.push("/projects")}>Back to Projects</button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const { project, steps } = projectData
  const top = (steps || []).filter((s: any) => !s.is_subtask && !s.parent_task_id && !s.deleted_at)
  const counted = ui.progressCountsSubtasks ? (steps || []).filter((s: any) => !s.deleted_at) : top
  const doneN = counted.filter((s: any) => s.status === "completed").length
  const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0
  const inProg = top.filter((s: any) => s.status === "in-progress").length
  const urgent = top.filter((s: any) => s.status !== "completed" && (s.priority === "urgent" || s.priority === "critical")).length
  const blocked = top.filter((s: any) => s.status === "blocked").length
  const openTasks = top.length - top.filter((s: any) => s.status === "completed").length
  const statusLabel: Record<string, string> = { planning: "Planning", "in-progress": "In progress", in_progress: "In progress", review: "Review", "on-hold": "On hold", on_hold: "On hold", completed: "Done" }

  return (
    <DashboardLayout>
    <div className="opx-page">
      {/* Project header */}
      <header className="opx-pbar">
        <div style={{ flex: 1, minWidth: 280 }}>
          <button className="opx-link" style={{ padding: 0 }} onClick={() => router.push("/projects")}>Projects ›</button>
          <h1>{project.name}</h1>
          <div className="opx-row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="opx-chip"><i className="opx-dot" style={{ background: "var(--opx-good)", width: 6, height: 6 }} />{statusLabel[project.status] || project.status}</span>
            {(project.current_phase_name || project.phase) && <span className="opx-chip">{project.current_phase_name || project.phase}</span>}
            {project.health && <span className="opx-chip"><i className="opx-dot" style={{ background: project.health === "critical" ? "var(--opx-hot)" : project.health === "attention" ? "var(--opx-warn)" : "var(--opx-good)", width: 6, height: 6 }} />{project.health}</span>}
            {project.updated_at && <span className="opx-muted" style={{ fontSize: 12.5 }}>Updated {new Date(project.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            <button className="opx-link" onClick={() => fetchProjectData(true)} aria-label="Refresh">{isRefreshing ? "Refreshing…" : "↺ Refresh"}</button>
          </div>
        </div>
        <div className="opx-stats">
          <div className="opx-stat"><b>{pct}%</b><span>{doneN} of {counted.length} done{ui.progressCountsSubtasks ? " (with subtasks)" : ""}</span></div>
          <div className="opx-stat"><b>{inProg}</b><span>In progress</span></div>
          <div className={`opx-stat${urgent ? " hot" : ""}`}><b>{urgent}</b><span>Urgent to do</span></div>
          <div className={`opx-stat${blocked ? " hot" : ""}`}><b>{blocked}</b><span>Blocked</span></div>
        </div>
      </header>

      <nav className="opx-ptabs" aria-label="Project sections">
        {TABS.map(tab => (
          <button key={tab.id} className={activeTab === tab.id ? "on" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)}>
            {tab.label}{tab.id === "tasks" && <em>{openTasks}</em>}
          </button>
        ))}
      </nav>

      {activeTab === "overview"  && <section className="opx-sec"><OverviewFacet project={project} projectId={projectId} phases={phases} onProjectChange={() => fetchProjectData(true)} /></section>}
      {activeTab === "tasks" && (
        <div className="opx-col" style={{ gap: 12 }}>
          <TaskViewSwitcher view={taskView} onChange={setTaskView} />
          {taskView === "board" && (
            <div style={{ height: "calc(100vh - 330px)", minHeight: 480 }}>
              <KanbanView projectId={projectId} onTaskSelect={() => {}} initialStepId={focusStepId} />
            </div>
          )}
          {taskView === "list" && <TaskList projectId={projectId} />}
          {taskView === "timeline" && <TaskTimeline projectId={projectId} />}
          {taskView === "calendar" && <TaskCalendar projectId={projectId} />}
        </div>
      )}
      {activeTab === "docs"      && <DocsTab projectId={projectId} coreDocs={ui.coreDocs} />}
      {activeTab === "decisions" && <IdeasDecisions projectId={projectId} projectName={project.name} />}
      {activeTab === "metrics"   && <MetricsTab projectId={projectId} />}
      {activeTab === "finance"   && <MoneyTab projectId={projectId} project={project} onChange={() => fetchProjectData(true)} />}
      {activeTab === "settings"  && <SettingsTab projectId={projectId} project={project} onChange={() => fetchProjectData(true)} />}
    </div>
    </DashboardLayout>
  )
}
