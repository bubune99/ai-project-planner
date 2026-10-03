"use client"

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react"
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from "@/components/navigation"
import { GanttView } from "@/components/views/GanttView"
import { KanbanView } from "@/components/views/KanbanView"
import { FullScreenCalendar, type CalendarDay } from "@/components/ui/fullscreen-calendar"
import { DocsView } from "@/components/views/DocsView"
import { transformStepsToPhases } from "@/lib/data-transforms"
import { ActivityFeed } from "@/components/project/activity-feed"
import type { Task, KanbanTask } from "@/lib/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RichText } from "@/components/shared/RichText"

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
  { id: "docs",       label: "Docs" },
  { id: "decisions",  label: "Decisions" },
  { id: "ideas",      label: "Ideas" },
  { id: "finance",    label: "Finance" },
  { id: "metrics",    label: "Metrics" },
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

// ─── Decisions ───────────────────────────────────────────────────────────────

function DecisionsFacet({ projectId }: { projectId: string }) {
  const [adrs, setAdrs] = useState<any[]>([])
  // The tab read architecture_decisions (ADRs) only, while create_decision —
  // the tool every agent actually calls — writes mlp_why_decisions. On
  // 2026-10-03 that was 8 rows shown against 80 recorded, which is why the tab
  // looked unused. Owner: "This tab clearly does not ever get used."
  const [decisions, setDecisions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: "", context: "", decision: "", consequences: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/projects/${projectId}/adrs`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/memory/why?projectId=${projectId}&limit=100`).then(r => r.json()).catch(() => ({})),
    ])
      .then(([adrRes, whyRes]) => {
        setAdrs(adrRes.adrs || [])
        setDecisions(whyRes.data || whyRes.decisions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  const createAdr = async () => {
    if (!form.title.trim() || !form.context.trim() || !form.decision.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/adrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.adr) {
        setAdrs(prev => [data.adr, ...prev])
        setForm({ title: "", context: "", decision: "", consequences: "" })
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (adrId: string, status: string) => {
    const res = await fetch(`/api/projects/${projectId}/adrs/${adrId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    if (data.adr) setAdrs(prev => prev.map(a => a.id === adrId ? data.adr : a))
  }

  const tone: Record<string, string> = { accepted: "j-pos", proposed: "j-warn", superseded: "j-muted", rejected: "j-neg" }
  const accepted   = adrs.filter(a => a.status === "accepted").length
  const proposed   = adrs.filter(a => a.status === "proposed").length
  const superseded = adrs.filter(a => a.status === "superseded" || a.status === "rejected").length

  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[["Decisions", decisions.length, "j-info"], ["ADRs", adrs.length, "j-proj"], ["Accepted", accepted, "j-pos"], ["Superseded", superseded, "j-muted"]].map(([l, v, t]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="j-card">
          <h4 className="j-card-title" style={{ marginBottom: 16 }}>New architecture decision</h4>
          <div className="j-col j-gap-3">
            {[
              { key: "title",        label: "Decision title",   placeholder: "e.g. Framework selection" },
              { key: "context",      label: "Context",          placeholder: "Why this decision was needed" },
              { key: "decision",     label: "Decision made",    placeholder: "What was decided" },
              { key: "consequences", label: "Consequences",     placeholder: "Trade-offs and implications (optional)" },
            ].map(f => (
              <div key={f.key}>
                <div className="j-eyebrow" style={{ marginBottom: 4 }}>{f.label}</div>
                <textarea
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={f.key === "title" ? 1 : 2}
                  style={{
                    width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)",
                    borderRadius: 7, padding: "8px 10px", fontSize: 13, color: "inherit",
                    fontFamily: "inherit", resize: "vertical", outline: "none",
                  }}
                />
              </div>
            ))}
            <div className="j-row j-gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="j-btn j-btn-primary" onClick={createAdr} disabled={saving}>
                {saving ? "Saving…" : "Save ADR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision episodes — what create_decision writes, and what every agent
          records. This is the list that was missing; ADRs follow below as the
          separate, older artifact they are. */}
      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <div>
            <h3 className="j-card-title">Decisions</h3>
            <p className="j-card-sub">Recorded via create_decision</p>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <span className="j-muted" style={{ fontSize: 13 }}>Loading…</span>
          </div>
        ) : decisions.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>
              No decisions recorded for this project yet.
            </p>
          </div>
        ) : (
          <table className="j-table">
            <thead><tr><th>Decision</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {decisions.map((d: any) => (
                <tr key={d.id}>
                  <td style={{ maxWidth: 520 }}>
                    <div style={{ fontSize: 13 }}>{d.title}</div>
                    {d.summary && (
                      <div className="j-muted" style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.summary}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`j-pill ${d.status === "resolved" ? "j-pos" : d.status === "revisit" ? "j-warn" : d.status === "deprecated" ? "j-muted" : "j-info"}`}>
                      {d.status || "active"}
                    </span>
                  </td>
                  <td className="j-muted" style={{ fontSize: 12 }}>
                    {d.createdAt ? String(d.createdAt).slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Architecture decisions</h3>
          {!showForm && (
            <button className="j-btn j-btn-primary" onClick={() => setShowForm(true)}>+ New ADR</button>
          )}
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="j-muted" style={{ fontSize: 13 }}>Loading decisions…</span>
          </div>
        ) : adrs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: "0 0 12px" }}>No architecture decisions recorded yet.</p>
            <button className="j-btn j-btn-primary" onClick={() => setShowForm(true)}>Record first ADR</button>
          </div>
        ) : (
          <table className="j-table">
            <thead><tr><th>#</th><th>Decision</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {adrs.map((a, i) => (
                <tr key={a.id}>
                  <td className="j-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>ADR-{String(i + 1).padStart(3, "0")}</td>
                  <td style={{ fontWeight: 500 }}>{a.title}</td>
                  <td><span className={`j-pill ${tone[a.status] || "j-muted"}`}>{a.status}</span></td>
                  <td className="j-muted" style={{ fontSize: 12 }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <select
                      value={a.status}
                      onChange={e => updateStatus(a.id, e.target.value)}
                      style={{
                        background: "transparent", border: "1px solid var(--j-ring)", borderRadius: 5,
                        padding: "2px 6px", fontSize: 11, color: "inherit", cursor: "pointer",
                      }}
                    >
                      <option value="proposed">proposed</option>
                      <option value="accepted">accepted</option>
                      <option value="superseded">superseded</option>
                      <option value="rejected">rejected</option>
                    </select>
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

// ─── Ideas ───────────────────────────────────────────────────────────────────

function IdeasFacet({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [ideas, setIdeas]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [promoting, setPromoting] = useState<string | null>(null)
  const [otherIdeas, setOtherIdeas] = useState<any[]>([])
  const [showOthers, setShowOthers] = useState(false)

  useEffect(() => {
    setLoading(true)
    // Fetch ideas promoted to this project + all non-promoted ideas
    Promise.all([
      fetch(`/api/ideas?projectId=${projectId}`).then(r => r.json()),
      fetch(`/api/ideas`).then(r => r.json()),
    ])
      .then(([promoted, all]) => {
        // These were concatenated into one list, so a project with 2 ideas of
        // its own showed all 57 in the account. Owner: "Ideas within a project
        // are meant to be sorted by the project. Not all ideas all at once."
        // Ideas are user-scoped — promoted_to_project_id is the only project
        // link — so the rest stay available, but behind an explicit opt-in.
        const promotedIds = new Set((promoted.data || []).map((i: any) => i.id))
        setIdeas(promoted.data || [])
        setOtherIdeas(
          (all.data || []).filter((i: any) => !promotedIds.has(i.id) && i.lifecycle !== "promoted")
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  // This used to POST /api/todos — so the button labelled "Promote to task"
  // created a TODO, which never shows up in the project's task views. That is
  // how 492 todos accumulated against zero project steps.
  const promoteToTask = async (ideaId: string, title: string) => {
    setPromoting(ideaId)
    try {
      const res = await fetch(`/api/projects/${projectId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: title, metadata: { sourceIdeaId: ideaId } }),
      })
      if (res.ok) {
        setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, _promoted: true } : i))
      }
    } finally {
      setPromoting(null)
    }
  }

  const lifecycleTone: Record<string, string> = {
    seed: "j-muted", exploring: "j-info", refined: "j-proj", promoted: "j-pos", archived: "j-muted",
  }

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div>
            <h3 className="j-card-title">Ideas</h3>
            <p className="j-card-sub">
              {ideas.filter(i => i.lifecycle !== "archived").length} in this project
              {otherIdeas.length > 0 ? ` · ${otherIdeas.length} elsewhere` : ""}
            </p>
          </div>
          <div className="j-row j-gap-2">
            {otherIdeas.length > 0 && (
              <button className="j-btn j-btn-ghost" onClick={() => setShowOthers(v => !v)}>
                {showOthers ? "Hide other ideas" : `Promote from ${otherIdeas.length} other…`}
              </button>
            )}
            <button className="j-btn j-btn-ghost" onClick={() => router.push("/idea-incubator")}>Open incubator ↗</button>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="j-muted" style={{ fontSize: 13 }}>Loading ideas…</span>
          </div>
        ) : ideas.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
              {otherIdeas.length > 0
                ? "No ideas promoted to this project yet."
                : "No ideas yet. Capture your first one in the incubator."}
            </p>
            <button className="j-btn j-btn-primary" onClick={() => router.push("/idea-incubator")}>Go to incubator</button>
          </div>
        ) : (
          <div className="j-col j-gap-3">
            {ideas.map(idea => (
              <div key={idea.id} className="j-card j-tight" style={{ padding: 14, background: "oklch(1 0 0 / 0.03)" }}>
                <div className="j-row j-between" style={{ marginBottom: 8 }}>
                  <div className="j-row j-gap-2">
                    <span className={`j-pill ${lifecycleTone[idea.lifecycle] || "j-muted"}`}>{idea.lifecycle}</span>
                    {idea.category && <span className="j-pill j-ghost">{idea.category}</span>}
                    {idea.promotedToProjectId === projectId && <span className="j-pill j-pos">linked</span>}
                  </div>
                  <span className="j-muted" style={{ fontSize: 11 }}>
                    {idea.updatedAt ? new Date(idea.updatedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: idea.description ? 4 : 0 }}>{idea.title}</div>
                {idea.description && (
                  <div className="j-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {idea.description.slice(0, 120)}{idea.description.length > 120 ? "…" : ""}
                  </div>
                )}
                {(idea.tags || []).length > 0 && (
                  <div className="j-row j-wrap j-gap-2" style={{ marginTop: 6 }}>
                    {(idea.tags as string[]).map(t => <span key={t} className="j-pill j-ghost" style={{ fontSize: 10 }}>{t}</span>)}
                  </div>
                )}
                {!idea._promoted && idea.lifecycle !== "promoted" && (
                  <div className="j-row j-gap-2" style={{ marginTop: 10 }}>
                    <button
                      className="j-btn j-btn-primary"
                      disabled={promoting === idea.id}
                      onClick={() => promoteToTask(idea.id, idea.title)}
                    >
                      {promoting === idea.id ? "Promoting…" : "Promote to task"}
                    </button>
                    <button className="j-btn j-btn-ghost" onClick={() => router.push(`/idea-incubator?id=${idea.id}`)}>
                      Open in incubator
                    </button>
                  </div>
                )}
                {idea._promoted && (
                  <div className="j-row j-gap-2" style={{ marginTop: 10 }}>
                    <span className="j-pill j-pos">Added to tasks ✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Everything NOT in this project, behind an explicit toggle. Promoting
            from here is what gives the idea a promoted_to_project_id and moves
            it into the list above. */}
        {showOthers && otherIdeas.length > 0 && (
          <div className="j-col j-gap-2" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--j-ring)" }}>
            <p className="j-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              Not in this project · {otherIdeas.length}
            </p>
            {otherIdeas.map(idea => (
              <div key={idea.id} className="j-row j-between" style={{ padding: "8px 10px", borderRadius: 6, background: "oklch(1 0 0 / 0.02)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{idea.title}</div>
                  <span className={`j-pill ${lifecycleTone[idea.lifecycle] || "j-muted"}`} style={{ fontSize: 10, marginTop: 4 }}>
                    {idea.lifecycle}
                  </span>
                </div>
                <button
                  className="j-btn j-btn-ghost"
                  disabled={promoting === idea.id}
                  onClick={() => promoteToTask(idea.id, idea.title)}
                  style={{ flexShrink: 0 }}
                >
                  {promoting === idea.id ? "Adding…" : "Add to tasks"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Finance ─────────────────────────────────────────────────────────────────

function FinanceFacet() {
  // Honest empty state: per-project finance attribution isn't wired yet.
  // The Finance module is the source of truth for money; redirect there.
  return (
    <div className="j-col j-gap-4">
      <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 48, textAlign: "center" }}>
        <h3 className="j-card-title" style={{ margin: 0 }}>Project finance not connected</h3>
        <p className="j-muted" style={{ fontSize: 13, maxWidth: 520, margin: 0 }}>
          Per-project budget, spend, and ROI live in the Finance module. Link this
          project to a finance budget or income stream there; this tab will surface
          a real summary once attribution is in place.
        </p>
        <a className="j-btn j-btn-primary" href="/finance" style={{ textDecoration: "none" }}>Open Finance →</a>
      </div>
    </div>
  )
}


// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarFacet({ projectId }: { projectId: string }) {
  const [now, setNow] = useState(() => new Date())
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [form, setForm] = useState({ title: "", description: "", time: "09:00" })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Scheduled steps are shown alongside calendar_events. They are NOT copied
  // into calendar_events: project_steps.end_date is the single source of truth,
  // so scheduling in the Gantt or the step form shows up here with no sync.
  const [scheduledSteps, setScheduledSteps] = useState<any[]>([])
  // A step chip was 9px text and inert — nothing to click, nothing to expand.
  const [selectedStep, setSelectedStep] = useState<any | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/steps`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !Array.isArray(d.steps)) return
        setScheduledSteps(d.steps.filter((st: any) => st.end_date || st.start_date))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId])

  // Compute month window (first/last day) for filtering
  const monthStart = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return d.toISOString().slice(0, 10)
  }, [now])
  const monthEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return d.toISOString()
  }, [now])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        source: "project",
        startDate: monthStart + "T00:00:00.000Z",
        endDate: monthEnd,
      })
      const r = await fetch(`/api/calendar?${qs.toString()}`)
      const j = await r.json()
      // Filter to this project (source=project narrows; sourceId pins it)
      const list = (j.data || []).filter((e: any) => e.sourceId === projectId || e.source_id === projectId)
      setEvents(list)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [monthStart, monthEnd, projectId])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const create = async () => {
    if (!selectedDate || !form.title.trim()) { setErr("Title is required"); return }
    setSaving(true); setErr(null)
    try {
      const start = `${selectedDate}T${form.time}:00`
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startTime: new Date(start).toISOString(),
          source: "project",
          sourceId: projectId,
          sourceMetadata: { projectId },
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j?.error?.message || "Failed to create event")
      setSelectedDate(null)
      setForm({ title: "", description: "", time: "09:00" })
      await fetchEvents()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create event")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this event?")) return
    await fetch(`/api/calendar/${id}`, { method: "DELETE" })
    await fetchEvents()
  }

  // Build the month grid (start on Monday, 35-42 cells)
  const monthLabel = now.toLocaleString(undefined, { month: "long", year: "numeric" })
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  // jsDay: Sun=0..Sat=6 → shift so Mon=0
  const leading = (firstDay.getDay() + 6) % 7
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7
  const todayKey = new Date().toISOString().slice(0, 10)

  const eventsByDate: Record<string, any[]> = {}
  for (const ev of events) {
    const key = (ev.startTime || ev.start_time || "").slice(0, 10)
    if (!key) continue
    ;(eventsByDate[key] ||= []).push(ev)
  }

  // Bucket by due date — that is the date a step "lands on".
  const stepsByDate: Record<string, any[]> = {}
  for (const st of scheduledSteps) {
    const key = String(st.end_date || st.start_date || "").slice(0, 10)
    if (!key) continue
    ;(stepsByDate[key] ||= []).push(st)
  }

  /*
    One shape for both sources. calendar_events and project_steps are separate
    tables — steps are never copied into calendar_events, project_steps.end_date
    stays the single source of truth — so they are merged only for display.
    Steps are tinted and clickable; events keep their existing delete-on-click.
  */
  const calendarData: CalendarDay[] = useMemo(() => {
    const byDay = new Map<string, CalendarDay>()
    const bucket = (key: string) => {
      let d = byDay.get(key)
      if (!d) {
        const [y, m, dd] = key.split("-").map(Number)
        d = { day: new Date(y, m - 1, dd), events: [] }
        byDay.set(key, d)
      }
      return d
    }

    for (const [key, evs] of Object.entries(eventsByDate)) {
      for (const ev of evs as any[]) {
        bucket(key).events.push({
          id: `event-${ev.id}`,
          name: ev.title,
          time: String(ev.startTime || ev.start_time || "").slice(11, 16),
          datetime: String(ev.startTime || ev.start_time || ""),
          onClick: () => setSelectedEvent(ev),
        })
      }
    }

    for (const [key, sts] of Object.entries(stepsByDate)) {
      for (const st of sts as any[]) {
        bucket(key).events.push({
          id: `step-${st.id}`,
          name: st.title,
          time: "",
          datetime: String(st.end_date || st.start_date || ""),
          color:
            st.status === "completed" ? "var(--j-pos)"
            : st.status === "blocked" ? "var(--j-neg)"
            : st.status === "in-progress" ? "var(--j-accent)"
            : "var(--j-warn, #d08c3c)",
          onClick: () => setSelectedStep(st),
        })
      }
    }

    return [...byDay.values()]
  }, [eventsByDate, stepsByDate])


  // monthPrefix matches the yyyy-mm the grid is showing. Counting every bucket
  // reported steps from other months and contradicted the cells below it.
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const stepsThisMonth = Object.entries(stepsByDate)
    .filter(([k]) => k.startsWith(monthPrefix))
    .reduce((n, [, v]) => n + v.length, 0)

  const goPrev = () => setNow(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNext = () => setNow(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => setNow(new Date())

  return (
    <div className="j-col j-gap-4">
      <div className="j-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="j-card-head" style={{ padding: "16px 16px 0" }}>
          <div>
            <h3 className="j-card-title">Project calendar</h3>
            <p className="j-card-sub">
              {loading
                ? "Loading…"
                : `${events.length} event${events.length === 1 ? "" : "s"} · ${stepsThisMonth} scheduled step${stepsThisMonth === 1 ? "" : "s"} · click a day to add an event`}
            </p>
          </div>
        </div>

        {/*
          Was a hand-rolled 7-column grid of .j-cal-day cells. Replaced with the
          shared FullScreenCalendar so the month view matches the rest of the
          app and gets today-marking, a real "+ N more" overflow and keyboard
          -reachable entries. Month navigation lives inside the component now,
          which is why it reports back through onMonthChange — the facet loads
          per month and would otherwise keep showing the old month's data.
        */}
        <div style={{ minHeight: 520, display: "flex" }}>
          <FullScreenCalendar
            data={calendarData}
            maxPerDay={3}
            onMonthChange={(first) => setNow(first)}
            onSelectDay={(d) => {
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
              setSelectedDate((prev) => (prev === key ? null : key))
            }}
          />
        </div>
      </div>

      {/* Step detail — a calendar chip used to be inert. Clicking one now opens
          the same facts the Gantt and the board show, without leaving the month. */}
      {/*
        Details open in a dialog over the calendar. They used to render as a
        card under it — below a full-height grid, so a click looked like it did
        nothing. Event clicks used to jump straight to "Delete this event?";
        delete now lives inside the event's dialog.
      */}
      <Dialog open={!!selectedStep} onOpenChange={(o) => { if (!o) setSelectedStep(null) }}>
        <DialogContent className="max-w-lg">
          {selectedStep && (
            <>
              <DialogHeader>
                <DialogTitle style={{ lineHeight: 1.35 }}>{selectedStep.title}</DialogTitle>
                <DialogDescription>
                  Project task · due {String(selectedStep.end_date || "").slice(0, 10) || "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="j-col j-gap-3">
                <div className="j-row j-wrap" style={{ gap: 6 }}>
                  <span className={`j-pill ${selectedStep.status === "completed" ? "j-pos" : selectedStep.status === "in-progress" ? "j-proj" : selectedStep.status === "blocked" ? "j-warn" : "j-muted"}`}>
                    {selectedStep.status}
                  </span>
                  {selectedStep.priority && <span className="j-pill j-ghost">{selectedStep.priority}</span>}
                  {selectedStep.phase && <span className="j-pill j-ghost">{selectedStep.phase}</span>}
                  {typeof selectedStep.progress === "number" && <span className="j-pill j-ghost">{selectedStep.progress}%</span>}
                </div>
                {selectedStep.description && selectedStep.description !== selectedStep.title && (
                  <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
                    <RichText text={selectedStep.description} />
                  </div>
                )}
                <div className="j-muted" style={{ fontSize: 12 }}>
                  {selectedStep.start_date
                    ? `Scheduled ${String(selectedStep.start_date).slice(0, 10)} → ${String(selectedStep.end_date || "").slice(0, 10)}`
                    : "No start date set"}
                  {selectedStep.blocked_reason ? ` · blocked: ${selectedStep.blocked_reason}` : ""}
                </div>
              </div>
              <DialogFooter>
                <a className="j-btn j-btn-primary" style={{ textDecoration: "none" }}
                  href={`?tab=tasks&view=board&step=${selectedStep.id}`}>
                  Open on board
                </a>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(o) => { if (!o) setSelectedEvent(null) }}>
        <DialogContent className="max-w-lg">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle style={{ lineHeight: 1.35 }}>{selectedEvent.title}</DialogTitle>
                <DialogDescription>
                  Event · {String(selectedEvent.startTime || selectedEvent.start_time || "").slice(0, 16).replace("T", " at ") || "no time set"}
                </DialogDescription>
              </DialogHeader>
              {selectedEvent.description ? (
                <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
                  <RichText text={selectedEvent.description} />
                </div>
              ) : (
                <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>No details.</p>
              )}
              <DialogFooter>
                <button className="j-btn j-btn-ghost" style={{ color: "var(--j-neg)" }}
                  onClick={async () => { const id = selectedEvent.id; await remove(id); setSelectedEvent(null) }}>
                  Delete event
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedDate && (
        <div className="j-card">
          <div className="j-card-head">
            <div><h3 className="j-card-title">Add event · {selectedDate}</h3></div>
            <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setSelectedDate(null)} aria-label="Close">✕</button>
          </div>
          <div className="j-col j-gap-3">
            <input className="j-search" placeholder="Event title *" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <div className="j-row j-gap-2">
              <input className="j-search" type="time" value={form.time} style={{ maxWidth: 120 }}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              <input className="j-search" style={{ flex: 1 }} placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
            <div className="j-row j-gap-2">
              <button className="j-btn j-btn-primary" onClick={create} disabled={saving}>
                {saving ? "Saving…" : "Add event"}
              </button>
              <button className="j-btn j-btn-ghost" onClick={() => setSelectedDate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function MetricsFacet({ project, steps }: { project: any; steps: any[] }) {
  const safeSteps = Array.isArray(steps) ? steps : []
  const totalSteps = safeSteps.length
  const doneSteps = safeSteps.filter(s => (s.status || "").toLowerCase() === "completed").length
  const inProgressSteps = safeSteps.filter(s => {
    const st = (s.status || "").toLowerCase()
    return st === "in_progress" || st === "in-progress" || st === "active"
  }).length
  const blockedSteps = safeSteps.filter(s => (s.status || "").toLowerCase() === "blocked").length

  // Real per-week completion trend (last 13 weeks) from step completed_at when available.
  const weeks = 13
  const trend: number[] = Array(weeks).fill(0)
  const now = new Date()
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setHours(0, 0, 0, 0)
  startOfThisWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday-anchored
  for (const s of safeSteps) {
    const ts = s.completed_at || s.completedAt || (s.status === "completed" ? s.updated_at || s.updatedAt : null)
    if (!ts) continue
    const d = new Date(ts).getTime()
    if (Number.isNaN(d)) continue
    const weeksAgo = Math.floor((startOfThisWeek.getTime() - d) / (7 * 864e5))
    if (weeksAgo >= 0 && weeksAgo < weeks) trend[weeks - 1 - weeksAgo]++
  }
  const trendSum = trend.reduce((a, b) => a + b, 0)
  const hasTrend = trendSum > 0
  const trendMax = Math.max(1, ...trend)
  const avgPerWeek = trendSum > 0
    ? (trend.filter(v => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, trend.filter(v => v > 0).length))
    : 0

  // Time to close: project age in days
  const startMs = project?.created_at || project?.createdAt
  const startedDays = startMs
    ? Math.max(1, Math.round((Date.now() - new Date(startMs).getTime()) / 864e5))
    : null

  const progress = typeof project?.progress === "number" ? project.progress : 0
  const kpis: { l: string; v: string; s: string; t: string }[] = [
    {
      l: "Completion rate",
      v: `${progress}%`,
      s: `${doneSteps} / ${totalSteps} steps`,
      t: progress >= 80 ? "j-pos" : progress >= 40 ? "j-info" : "j-muted",
    },
    {
      l: "Steps in progress",
      v: `${inProgressSteps}`,
      s: blockedSteps > 0 ? `${blockedSteps} blocked` : "no blockers",
      t: blockedSteps > 0 ? "j-warn" : "j-info",
    },
    {
      l: "Avg per active week",
      v: hasTrend ? avgPerWeek.toFixed(1) : "—",
      s: hasTrend ? "completed steps" : "needs completion data",
      t: hasTrend ? "j-info" : "j-muted",
    },
    {
      l: "Project age",
      v: startedDays != null ? `${startedDays}d` : "—",
      s: startedDays != null ? "since created" : "no start date",
      t: "j-ghost",
    },
  ]

  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {kpis.map(k => (
          <div key={k.l} className="j-card">
            <div className="j-eyebrow">{k.l}</div>
            <div className="j-amount-xl" style={{ marginTop: 8 }}>{k.v}</div>
            <span className={`j-pill ${k.t}`} style={{ marginTop: 8 }}>{k.s}</span>
          </div>
        ))}
      </div>
      <div className="j-card">
        <div className="j-card-head">
          <div>
            <h3 className="j-card-title">Completed steps · last 13 weeks</h3>
            <p className="j-card-sub">
              {hasTrend ? `${trendSum} steps completed in the trailing 13 weeks` : "No completion timestamps yet — close some steps to populate this trend"}
            </p>
          </div>
        </div>
        {hasTrend ? (
          <div style={{ position: "relative", height: 200, paddingTop: 20 }}>
            <div style={{ position: "absolute", inset: 20, borderBottom: "1px solid var(--j-hairline)" }} />
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="metric-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.870 0.045 252 / 0.35)" />
                  <stop offset="100%" stopColor="oklch(0.870 0.045 252 / 0)" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke="oklch(0.870 0.045 252)"
                strokeWidth="0.6"
                points={trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${100 - (v / trendMax) * 70 - 15}`).join(" ")}
              />
              <polygon
                fill="url(#metric-grad)"
                points={`0,100 ${trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${100 - (v / trendMax) * 70 - 15}`).join(" ")} 100,100`}
              />
            </svg>
          </div>
        ) : (
          <div className="j-muted" style={{ fontSize: 13, padding: 40, textAlign: "center" }}>
            Trend will appear once steps have completion timestamps.
          </div>
        )}
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

// ─── Team ────────────────────────────────────────────────────────────────────
// Note: Team here = humans (collaborators on this project). Agents live on the
// separate Agents tab. This separation is intentional per feedback fd8e5217.

function TeamFacet() {
  const params = useParams()
  const projectId = params?.id as string
  const [owner, setOwner] = useState<any>(null)
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    fetch(`/api/projects/${projectId}/collaborators`)
      .then(r => r.json())
      .then(j => {
        if (j?.success && j?.data) {
          setOwner(j.data.owner || null)
          setCollaborators(Array.isArray(j.data.collaborators) ? j.data.collaborators : [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const allHumans = [
    ...(owner ? [{ ...owner, role: "owner" }] : []),
    ...collaborators,
  ]

  if (loading) {
    return <div className="j-card"><span className="j-muted">Loading team…</span></div>
  }

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div>
            <h3 className="j-card-title">People</h3>
            <p className="j-card-sub">
              {allHumans.length} {allHumans.length === 1 ? "person" : "people"} on this project · agents live on the Agents tab
            </p>
          </div>
        </div>
        {allHumans.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>No collaborators yet.</p>
          </div>
        ) : (
          <div className="j-grid j-cols-3">
            {allHumans.map((m: any) => {
              const name = m.name || m.displayName || m.email || "Unknown"
              const role = (m.role || "collaborator").toString()
              const initials = (name || "U").split(/\s+/).map((p: string) => p[0]).join("").slice(0, 2).toUpperCase()
              return (
                <div key={m.id || m.userId || m.email} className="j-card">
                  <div className="j-row j-gap-3" style={{ marginBottom: 8 }}>
                    <div className="j-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      {m.email && <div className="j-muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>}
                    </div>
                    <span className={`j-pill ${role === "owner" ? "j-pos" : "j-ghost"}`} style={{ fontSize: 9 }}>{role}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="j-card j-row j-between" style={{ alignItems: "center" }}>
        <div>
          <p className="j-card-sub" style={{ margin: 0, fontSize: 12 }}>
            Looking for agent activity? Agents have their own dedicated workspace.
          </p>
        </div>
        <a className="j-btn j-btn-ghost" href="#" onClick={(e) => { e.preventDefault(); document.querySelector<HTMLButtonElement>('button')?.click() }} style={{ pointerEvents: "none", opacity: 0.5 }}>
          See Agents tab →
        </a>
      </div>
    </div>
  )
}

// ─── Settings ────────────────────────────────────────────────────────────────
// One place for what describes the project rather than the work in it:
// general details, the people on it, and where its code lives. Team and Links
// were separate tabs; Links was six hard-coded placeholder links, identical on
// every project. The real links are the repo URL and the bound workspace path.
//
// PATCH /api/projects/[id] COALESCEs every field, so a field can be changed but
// not blanked — an emptied input is sent as "no change", and the hint says so.

const PROJECT_STATUSES = ["planning", "in-progress", "on-hold", "completed"] as const
const PROJECT_PRIORITIES = ["low", "medium", "high", "critical"] as const

function SettingsFacet({ project, projectId, onChange }: { project: any; projectId: string; onChange: () => void }) {
  const initial = useMemo(() => ({
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "planning",
    priority: project?.priority ?? "medium",
    due_date: project?.due_date ? String(project.due_date).slice(0, 10) : "",
    github_repo_url: project?.github_repo_url ?? "",
  }), [project])
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { setForm(initial) }, [initial])

  const dirty = (Object.keys(form) as (keyof typeof form)[]).filter(k => form[k] !== initial[k])

  const save = async () => {
    if (!form.name.trim()) { setMsg({ ok: false, text: "Name is required" }); return }
    setSaving(true); setMsg(null)
    try {
      const body: Record<string, string> = {}
      for (const k of dirty) if (String(form[k]).trim()) body[k] = String(form[k]).trim()
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error?.message || j?.error || `HTTP ${res.status}`)
      }
      setMsg({ ok: true, text: "Saved" })
      onChange()
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to save" })
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, id: string, control: ReactNode, hint?: string) => (
    <div className="j-col" style={{ gap: 6 }}>
      <label htmlFor={id} className="j-eyebrow">{label}</label>
      {control}
      {hint && <span className="j-muted" style={{ fontSize: 11 }}>{hint}</span>}
    </div>
  )
  const withCurrent = (opts: readonly string[], cur: string) => (opts.includes(cur) ? opts : [cur, ...opts])

  return (
    <div className="j-col j-gap-4" style={{ maxWidth: 760 }}>
      <div className="j-card">
        <div className="j-card-head"><div><h3 className="j-card-title">General</h3></div></div>
        <div className="j-col" style={{ gap: 14 }}>
          {field("Name", "ps-name",
            <input id="ps-name" className="j-search" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />)}
          {field("Description", "ps-desc",
            <textarea id="ps-desc" className="j-search" rows={3} style={{ resize: "vertical", height: "auto", padding: 10 }}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />)}
          <div className="j-grid j-cols-3" style={{ gap: 12 }}>
            {field("Status", "ps-status",
              <select id="ps-status" className="j-search" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {withCurrent(PROJECT_STATUSES, form.status).map(s => <option key={s} value={s}>{s}</option>)}
              </select>)}
            {field("Priority", "ps-priority",
              <select id="ps-priority" className="j-search" value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {withCurrent(PROJECT_PRIORITIES, form.priority).map(p => <option key={p} value={p}>{p}</option>)}
              </select>)}
            {field("Due date", "ps-due",
              <input id="ps-due" type="date" className="j-search" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />)}
          </div>
        </div>
      </div>

      <div className="j-card">
        <div className="j-card-head"><div><h3 className="j-card-title">Links</h3></div></div>
        <div className="j-col" style={{ gap: 14 }}>
          {field("Repository", "ps-repo",
            <input id="ps-repo" className="j-search" placeholder="https://github.com/owner/repo" value={form.github_repo_url}
              onChange={e => setForm(f => ({ ...f, github_repo_url: e.target.value }))} />,
            "Changing it works; clearing it is not supported yet.")}
          {field("Workspace", "ps-ws",
            <input id="ps-ws" className="j-search" readOnly value={project?.workspace_path || "Not bound"} style={{ opacity: 0.75 }} />,
            "Set by agents with register_workspace — the local path this project's code lives at.")}
        </div>
      </div>

      <div className="j-row" style={{ gap: 10, alignItems: "center" }}>
        <button className="j-btn j-btn-primary" disabled={saving || dirty.length === 0} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty.length > 0 && !saving && (
          <button className="j-btn j-btn-ghost" onClick={() => { setForm(initial); setMsg(null) }}>Discard</button>
        )}
        {msg && <span className={msg.ok ? "j-pos" : "j-neg"} style={{ fontSize: 12.5 }} role="status">{msg.text}</span>}
      </div>

      <div>
        <h3 className="j-card-title" style={{ marginBottom: 10 }}>Team</h3>
        <TeamFacet />
      </div>
    </div>
  )
}


// Tabs retired 2026-10-03, mapped to where their content now lives so links
// already shared keep working: Notes joined the Overview activity feed, Risks
// is a card on Overview, Team and Links are sections of Settings.
// Agents was removed the same day: 0 jobs ever dispatched, and no worker
// drains agent_jobs. The table and MCP tools stay — /inbox builds on them.
const LEGACY_TABS: Record<string, string> = { notes: "overview", risks: "overview", team: "settings", links: "settings", agents: "overview" }

// ─── Task views ──────────────────────────────────────────────────────────────

type TaskView = "board" | "timeline" | "calendar"
const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: "board",    label: "Board" },
  { id: "timeline", label: "Timeline" },
  { id: "calendar", label: "Calendar" },
]

/*
  Board, Timeline and Calendar used to be three separate project tabs over the
  same project_steps. They are one tab now with a view switch, the way ClickUp
  and Linear present it — you change how you look at the work, not where it is.
*/
function TaskViewSwitcher({ view, onChange }: { view: TaskView; onChange: (v: TaskView) => void }) {
  return (
    <div role="tablist" aria-label="Task view" className="j-row" style={{ gap: 2, padding: 2, borderRadius: 8, boxShadow: "inset 0 0 0 1px var(--j-ring)", alignSelf: "flex-start" }}>
      {TASK_VIEWS.map(v => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          onClick={() => onChange(v.id)}
          style={{
            padding: "5px 12px", fontSize: 12.5, borderRadius: 6, border: "none", cursor: "pointer",
            background: view === v.id ? "oklch(0.240 0 0)" : "transparent",
            color: view === v.id ? "oklch(0.985 0 0)" : "oklch(0.556 0 0)",
            fontWeight: view === v.id ? 500 : 400,
          }}
        >
          {v.label}
        </button>
      ))}
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
  const rawTab  = searchParams.get("tab") || "overview"
  const legacyView = rawTab === "gantt" ? "timeline" : rawTab === "calendar" ? "calendar" : null
  const activeTab  = legacyView ? "tasks" : (LEGACY_TABS[rawTab] ?? rawTab)
  const taskView: TaskView = (legacyView || (TASK_VIEWS.some(v => v.id === searchParams.get("view")) ? searchParams.get("view") : "board")) as TaskView
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
      if (json.success && json.data) setProjectData(json.data)
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
  const statusClass = STATUS_CLASS[project.status] || "j-muted"
  const healthClass = HEALTH_CLASS[project.health] || "j-info"

  return (
    <DashboardLayout>
    <div style={{ minHeight: "100vh" }}>
      {/* Project header */}
      <div style={{ borderBottom: "1px solid var(--j-hairline)", padding: "14px 32px" }}>
        <div className="j-row j-between">
          <div className="j-row j-gap-4">
            <button
              className="j-btn j-btn-ghost"
              onClick={() => router.push("/projects")}
              style={{ fontSize: 12 }}
            >
              ← Projects
            </button>
            <div className="j-row j-gap-3">
              <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>{project.name}</h1>
              <span className={`j-pill ${healthClass}`}><span className="j-pill-dot" />{project.health}</span>
              {project.phase && <span className="j-pill j-ghost">{project.phase}</span>}
              <span className={`j-pill ${statusClass}`}>{STATUS_LABEL[project.status] || project.status}</span>
            </div>
          </div>
          <div className="j-row j-gap-2">
            <div className="j-row j-gap-3" style={{ marginRight: 8 }}>
              <span className="j-muted" style={{ fontSize: 11 }}>Progress</span>
              <div style={{ width: 80 }}>
                <div className="j-progress j-thick">
                  <span style={{ width: `${project.progress || 0}%` }} />
                </div>
              </div>
              <span className="j-num" style={{ fontSize: 12 }}>{project.progress || 0}%</span>
            </div>
            <button className="j-btn j-btn-ghost" style={{ fontSize: 12 }} onClick={() => fetchProjectData(true)}>
              {isRefreshing ? "…" : "↺"} Refresh
            </button>
          </div>
        </div>
      </div>

      {/* 16-tab facet rail */}
      <div style={{ borderBottom: "1px solid var(--j-hairline)", padding: "0 32px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 0, paddingTop: 10 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--j-accent)" : "2px solid transparent",
                color: activeTab === tab.id ? "oklch(0.985 0 0)" : "oklch(0.556 0 0)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Facet content — full-width; per-facet cards can self-constrain */}
      <div style={{ padding: "24px 32px" }}>
        {activeTab === "overview"  && <OverviewFacet  project={project} projectId={projectId} phases={phases} onProjectChange={() => fetchProjectData(true)} />}
        {activeTab === "tasks" && (
          <div className="j-col" style={{ gap: 12 }}>
            <TaskViewSwitcher view={taskView} onChange={setTaskView} />
            {taskView === "board" && (
              <div style={{ height: "calc(100vh - 248px)" }}>
                <KanbanView projectId={projectId} onTaskSelect={() => {}} initialStepId={focusStepId} />
              </div>
            )}
            {taskView === "timeline" && (
              <div style={{ height: "calc(100vh - 248px)" }}>
                <GanttView projectId={projectId} onTaskSelect={() => {}} />
              </div>
            )}
            {taskView === "calendar" && <CalendarFacet projectId={projectId} />}
          </div>
        )}
        {activeTab === "docs"      && (
          <div style={{ height: "calc(100vh - 200px)" }}>
            <DocsView projectId={projectId} />
          </div>
        )}
        {activeTab === "decisions" && <DecisionsFacet projectId={projectId} />}
        {activeTab === "ideas"     && <IdeasFacet projectId={projectId} />}
        {activeTab === "finance"   && <FinanceFacet />}
        {activeTab === "metrics"   && <MetricsFacet project={project} steps={steps} />}
        {activeTab === "settings"  && <SettingsFacet project={project} projectId={projectId} onChange={() => fetchProjectData(true)} />}
      </div>
    </div>
    </DashboardLayout>
  )
}
