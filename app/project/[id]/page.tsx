"use client"
import { usePageTitle } from "@/lib/hooks/use-page-title"

import { useRoomBelow } from "@/lib/layout/use-room-below"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from "@/components/navigation"
import { KanbanView } from "@/components/views/KanbanView"
import { phaseStrip, type StripPhase } from "@/lib/project/phase-strip"
import { Check } from "lucide-react"
import { ActivityFeed } from "@/components/project/activity-feed"
import { Figure, Seg, unwrap, useJson } from "@/components/project/opx/shared"
import { RisksCard } from "@/components/project/opx/RisksCard"
import { TaskList, TaskTimeline, TaskCalendar } from "@/components/project/opx/TaskViews"
import { DocsTab } from "@/components/project/opx/DocsTab"
import { ChecksTab } from "@/components/project/opx/ChecksTab"
import { ChangesTab } from "@/components/project/opx/ChangesTab"
import { DirectionTab } from "@/components/project/opx/DirectionTab"
import { PeopleFlowsTab } from "@/components/project/opx/PeopleFlowsTab"
import { ScrollRow } from "@/components/project/opx/ScrollRow"
import { NeedsYou, useNeedsYou } from "@/components/project/opx/NeedsYou"
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
  { id: "direction",  label: "Direction" },
  { id: "metrics",    label: "Metrics" },
  { id: "people",     label: "People and flows" },
  { id: "checks",     label: "Checks" },
  { id: "changes",    label: "Changes" },
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

interface OverviewProgress { pct: number; done: number; total: number }
interface OverviewKpi { l: string; v: string; tone?: string }

function OverviewFacet({ project, projectId, phases, progress, onProjectChange }: { project: any; projectId: string; phases: { phases: StripPhase[]; outside: number }; progress: OverviewProgress; onProjectChange: () => void }) {
  const health = project.health || "good"
  // Progress and Tasks done are the header's own figures, worked out from the live tasks. The stored
  // project.progress was a second figure that drifted (33% here beside a header saying 31%).
  const kpis: OverviewKpi[] = [
    { l: "Progress",      v: `${progress.pct}%` },
    { l: "Tasks done",    v: `${progress.done} / ${progress.total}` },
    { l: "Active agents", v: `${project.active_agents || 0}` },
    { l: "Health",        v: health, tone: HEALTH_CLASS[health] || "j-info" },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4 opx-kpis">
        {kpis.map(k => (
          <div key={k.l} className="j-card j-tight opx-kpi">
            <div className="j-eyebrow">{k.l}</div>
            <div className="j-amount-lg" style={{ marginTop: 8 }}>
              {k.tone ? <span className={`j-pill ${k.tone}`}>{k.v}</span> : k.v}
            </div>
          </div>
        ))}
      </div>

      <PhaseStrip strip={phases} />

      {project.description && (
        <div className="j-card">
          <div className="j-card-head"><div><h3 className="j-card-title">About</h3></div></div>
          <p className="j-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>{project.description}</p>
          {(project.tech_stack || []).length > 0 && (
            <div className="j-row j-wrap" style={{ marginTop: 14, gap: 6 }}>
              {(project.tech_stack as string[]).map((t) => (
                <span key={t} className="j-pill j-ghost" style={{ fontSize: 12 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <RisksCard projectId={projectId} project={project} onChange={onProjectChange} />
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
function PhaseStrip({ strip }: { strip: { phases: StripPhase[]; outside: number } }) {
  const phases = strip.phases
  if (phases.length < 2) return null
  const done = phases.filter((p) => p.status === "done").length
  const active = phases.filter((p) => p.status === "active").length
  const fillPct = Math.max(0, ((done + active * 0.5) / phases.length) * 100)
  const sub = [`${done} done`, `${active} active`, `${phases.length - done - active} upcoming`]
  if (strip.outside) sub.push(`${strip.outside} ${strip.outside === 1 ? "task" : "tasks"} not in a phase`)

  return (
    <div className="j-card" data-testid="phase-strip">
      <div className="j-card-head">
        <div>
          <h3 className="j-card-title">Phases</h3>
          <p className="j-card-sub">{sub.join(" · ")}</p>
        </div>
      </div>
      <div style={{ position: "relative", padding: "4px 0 8px" }}>
        <div className="phase-rail" style={{ position: "absolute", top: 18, left: 18, right: 18, height: 2, background: "var(--j-hairline)" }} />
        <div className="phase-rail" style={{ position: "absolute", top: 18, left: 18, width: `calc(${fillPct}% - 18px)`, height: 2, background: "var(--j-accent)" }} />
        {/* On a phone the phases stack, one row each (owner, 440px, 2026-11-16: "These are very squished on mobile"). */}
        <div className="j-row phase-row" style={{ justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          {phases.map((ph) => {
            const d = ph.status === "done"
            const a = ph.status === "active"
            return (
              <div key={ph.number} data-phase={ph.number} className="j-col phase-item" style={{ alignItems: "center", flex: 1, minWidth: 0, gap: 6, padding: "0 6px" }}>
                <div aria-hidden style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: a ? "var(--j-accent)" : d ? "var(--j-pos)" : "oklch(0.180 0 0)",
                  color: a || d ? "oklch(0.110 0.028 268)" : "oklch(0.708 0 0)",
                  display: "grid", placeItems: "center",
                  boxShadow: a ? "0 0 0 4px oklch(0.870 0.045 252 / 0.2), 0 0 0 1px var(--j-ring-strong)" : "0 0 0 1px var(--j-ring-strong)",
                  fontWeight: 600, fontSize: 12,
                }}>
                  {d ? <Check className="h-3.5 w-3.5" /> : ph.number}
                </div>
                <div className="phase-text" style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{ph.name}</div>
                  <span className="j-muted" style={{ fontSize: 12 }}>
                    Phase {ph.number} · {d ? "done" : a ? "in progress" : "not started"}{ph.total > 1 ? ` · ${ph.done} of ${ph.total} tasks` : ""}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Risks ───────────────────────────────────────────────────────────────────

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
/** The board takes the room left below it, so the page does not scroll as well as the board (owner, 2026-11-16). */
function BoardRoom({ children }: { children: React.ReactNode }) {
  const { ref, height } = useRoomBelow<HTMLDivElement>()
  return <div ref={ref} data-testid="board-room" style={{ height: height ?? "calc(100vh - 330px)" }}>{children}</div>
}

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
  // A link that names a card (?step=, from a card's Copy link) opens it on the board, whatever the default tab is.
  const linkedStep = searchParams.get("step")
  const rawTab  = searchParams.get("tab") || (linkedStep ? "tasks" : null) || ui.defaultTab || "overview"
  const legacyView = rawTab === "gantt" ? "timeline" : rawTab === "calendar" ? "calendar" : null
  const activeTab  = legacyView ? "tasks" : (LEGACY_TABS[rawTab] ?? rawTab)
  const viewParam = searchParams.get("view") as TaskView | null
  const taskView: TaskView = (legacyView || (viewParam && TASK_VIEWS.includes(viewParam) ? viewParam : linkedStep ? "board" : TASK_VIEWS.includes(ui.defaultTaskView as TaskView) ? ui.defaultTaskView : "board")) as TaskView
  const focusStepId = linkedStep
  const setUrl = useCallback((next: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) v === null ? q.delete(k) : q.set(k, v)
    router.replace(`?${q.toString()}`, { scroll: false })
  }, [router, searchParams])
  const setActiveTab = useCallback((tab: string) => setUrl({ tab, view: null, step: null }), [setUrl])
  const setTaskView  = useCallback((view: TaskView) => setUrl({ tab: "tasks", view, step: null }), [setUrl])
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  usePageTitle(projectData?.project?.name)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const projectId = params.id as string
  /*
   * Header stats need is_subtask, parent_task_id and priority, which the
   * project record's own step list leaves out (it counted 29 subtasks and
   * saw no urgent work on production). Read the full step list instead.
   */
  const stepsQ = useJson(projectId ? `/api/projects/${projectId}/steps` : null)
  const waiting = useNeedsYou(projectId, stepsQ.data)
  // Build decisions waiting on the owner in the Direction tab (lib/direction): counted on the tab, never guessed.
  const directionQ = useJson<{ doc?: { upcoming?: { status: string }[] } }>(`/api/projects/${projectId}/direction`)
  const directionWaiting = directionQ.data?.doc?.upcoming?.filter((u) => u.status === "waiting").length ?? 0

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

  const phases = useMemo(() => phaseStrip(projectData?.steps || []), [projectData?.steps])

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
  const allSteps: any[] = unwrap<any[]>(stepsQ.data, "steps") || steps || []
  const stepsKnown = stepsQ.data != null
  const top = allSteps.filter((s: any) => !s.is_subtask && !s.parent_task_id && !s.deleted_at)
  const counted = ui.progressCountsSubtasks ? allSteps.filter((s: any) => !s.deleted_at) : top
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
            <button className="opx-link" onClick={() => { fetchProjectData(true); stepsQ.reload() }} aria-label="Refresh">{isRefreshing ? "Refreshing…" : "↺ Refresh"}</button>
          </div>
        </div>
        <div className="opx-stats">
          {/* Until the full step list arrives the figures are not known: the project record's own list has no
              priorities, so Urgent read 0 and then 3 (flash watch, 2026-11-16). */}
          <div className="opx-stat"><b><Figure value={stepsKnown ? `${pct}%` : null} w="3ch" /></b><span>{stepsKnown ? `${doneN} of ${counted.length} done${ui.progressCountsSubtasks ? " (with subtasks)" : ""}` : "Done"}</span></div>
          <div className="opx-stat"><b><Figure value={stepsKnown ? inProg : null} /></b><span>In progress</span></div>
          <div className={`opx-stat${stepsKnown && urgent ? " hot" : ""}`}><b><Figure value={stepsKnown ? urgent : null} /></b><span>Urgent to do</span></div>
          <div className={`opx-stat${stepsKnown && blocked ? " hot" : ""}`}><b><Figure value={stepsKnown ? blocked : null} /></b><span>Blocked</span></div>
        </div>
      </header>

      <NeedsYou state={waiting} onOpenTab={setActiveTab} />

      <ScrollRow as="nav" className="opx-ptabs" label="Project sections">
        {TABS.map(tab => (
          <button key={tab.id} className={activeTab === tab.id ? "on" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)}>
            {tab.label}{tab.id === "tasks" && <em>{openTasks}</em>}
            {tab.id === "changes" && waiting.value.changes.length > 0 && <em>{waiting.value.changes.length}</em>}
            {tab.id === "people" && waiting.value.yours.length > 0 && <em>{waiting.value.yours.length}</em>}
            {tab.id === "direction" && directionWaiting > 0 && <em>{directionWaiting}</em>}
          </button>
        ))}
      </ScrollRow>

      {activeTab === "overview"  && <section className="opx-sec"><OverviewFacet project={project} projectId={projectId} phases={phases} progress={{ pct, done: doneN, total: counted.length }} onProjectChange={() => fetchProjectData(true)} /></section>}
      {activeTab === "tasks" && (
        <div className="opx-col" style={{ gap: 12 }}>
          <TaskViewSwitcher view={taskView} onChange={setTaskView} />
          {taskView === "board" && (
            <BoardRoom>
              <KanbanView projectId={projectId} onTaskSelect={() => {}} initialStepId={focusStepId} />
            </BoardRoom>
          )}
          {taskView === "list" && <TaskList projectId={projectId} />}
          {taskView === "timeline" && <TaskTimeline projectId={projectId} />}
          {taskView === "calendar" && <TaskCalendar projectId={projectId} />}
        </div>
      )}
      {activeTab === "docs"      && <DocsTab projectId={projectId} coreDocs={ui.coreDocs} project={project} onProjectChange={() => fetchProjectData(true)} />}
      {activeTab === "decisions" && <IdeasDecisions projectId={projectId} projectName={project.name} />}
      {activeTab === "metrics"   && <MetricsTab projectId={projectId} />}
      {activeTab === "people"    && <PeopleFlowsTab projectId={projectId} />}
      {activeTab === "checks"    && <ChecksTab projectId={projectId} />}
      {activeTab === "changes"   && <ChangesTab projectId={projectId} />}
      {activeTab === "direction" && <DirectionTab projectId={projectId} />}
      {activeTab === "finance"   && <MoneyTab projectId={projectId} project={project} onChange={() => fetchProjectData(true)} />}
      {activeTab === "settings"  && <SettingsTab projectId={projectId} project={project} onChange={() => fetchProjectData(true)} />}
    </div>
    </DashboardLayout>
  )
}
