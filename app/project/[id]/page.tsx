"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from "@/components/navigation"
import { GanttView } from "@/components/views/GanttView"
import { KanbanView } from "@/components/views/KanbanView"
import { FlowView } from "@/components/views/FlowView"
import { DocsView } from "@/components/views/DocsView"
import { transformStepsToPhases, transformStepsToFlow } from "@/lib/data-transforms"
import type { Task, KanbanTask } from "@/lib/types"

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
  { id: "roadmap",    label: "Roadmap" },
  { id: "gantt",      label: "Gantt" },
  { id: "flow",       label: "Flow" },
  { id: "docs",       label: "Docs" },
  { id: "decisions",  label: "Decisions" },
  { id: "ideas",      label: "Ideas" },
  { id: "finance",    label: "Finance" },
  { id: "agents",     label: "Agents" },
  { id: "notes",      label: "Notes" },
  { id: "calendar",   label: "Calendar" },
  { id: "metrics",    label: "Metrics" },
  { id: "risks",      label: "Risks" },
  { id: "team",       label: "Team" },
  { id: "links",      label: "Links" },
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

function OverviewFacet({ project, progressNotes }: { project: any; progressNotes: any[] }) {
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

      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)" }}>
          <h3 className="j-card-title">Recent activity</h3>
        </div>
        {(progressNotes || []).slice(0, 8).map((note: any) => (
          <div key={note.id} className="j-row" style={{ gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--j-accent)", marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{note.title || "Update"}</div>
              {note.content && (
                <div className="j-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {typeof note.content === "string" ? note.content.slice(0, 100) : ""}
                </div>
              )}
            </div>
            <span className="j-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
              {note.created_at ? new Date(note.created_at).toLocaleDateString() : ""}
            </span>
          </div>
        ))}
        {(!progressNotes || progressNotes.length === 0) && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>No activity yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Roadmap ─────────────────────────────────────────────────────────────────

function RoadmapFacet({ phases }: { phases: any[] }) {
  if (!phases || phases.length === 0) {
    return (
      <div className="j-coming-soon">
        <p className="j-muted" style={{ margin: 0 }}>No phases defined yet. Add steps to this project to see the roadmap.</p>
      </div>
    )
  }
  const done     = phases.filter(p => p.status === "done" || p.status === "completed").length
  const active   = phases.filter(p => p.status === "in_progress" || p.status === "active").length
  const upcoming = phases.length - done - active

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div><h3 className="j-card-title">Phase progression</h3><p className="j-card-sub">{done} done · {active} active · {upcoming} upcoming</p></div>
        </div>
        <div style={{ position: "relative", padding: "8px 0 24px" }}>
          <div style={{ position: "absolute", top: 28, left: 24, right: 24, height: 2, background: "var(--j-hairline)" }} />
          <div style={{ position: "absolute", top: 28, left: 24, width: `calc(${Math.max(0, (done + active * 0.5) / phases.length * 100)}% - 24px)`, height: 2, background: "var(--j-accent)" }} />
          <div className="j-row" style={{ justifyContent: "space-between", position: "relative" }}>
            {phases.map((ph: any, i: number) => {
              const isDone   = ph.status === "done" || ph.status === "completed"
              const isActive = ph.status === "in_progress" || ph.status === "active"
              const tone     = isDone ? "j-pos" : isActive ? "j-proj" : "j-muted"
              return (
                <div key={ph.id || i} className="j-col" style={{ alignItems: "center", flex: 1, minWidth: 0, gap: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: isActive ? "var(--j-accent)" : isDone ? "var(--j-pos)" : "oklch(0.180 0 0)",
                    color: isActive || isDone ? "oklch(0.110 0.028 268)" : "oklch(0.708 0 0)",
                    display: "grid", placeItems: "center",
                    boxShadow: isActive ? "0 0 0 4px oklch(0.870 0.045 252 / 0.2), 0 0 0 1px var(--j-ring-strong)" : "0 0 0 1px var(--j-ring-strong)",
                    fontWeight: 600, fontSize: 12,
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{ph.name}</div>
                  </div>
                  <span className={`j-pill ${tone}`} style={{ fontSize: 9 }}>{ph.progress || 0}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="j-grid j-cols-3">
        {phases.map((ph: any, i: number) => {
          const isDone   = ph.status === "done" || ph.status === "completed"
          const isActive = ph.status === "in_progress" || ph.status === "active"
          const tone     = isDone ? "j-pos" : isActive ? "j-proj" : "j-muted"
          return (
            <div key={ph.id || i} className="j-card" style={{ opacity: !isDone && !isActive ? 0.6 : 1 }}>
              <div className="j-row j-between" style={{ marginBottom: 12 }}>
                <h4 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{ph.name}</h4>
                <span className={`j-pill ${tone}`}><span className="j-pill-dot" />{ph.status}</span>
              </div>
              <div className="j-progress j-thick" style={{ marginBottom: 10 }}>
                <span style={{ width: `${ph.progress || 0}%`, background: isActive ? "var(--j-accent)" : "var(--j-pos)" }} />
              </div>
              <div className="j-row j-between" style={{ fontSize: 11 }}>
                <span className="j-muted">Completion</span>
                <span className="j-num">{ph.progress || 0}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Decisions ───────────────────────────────────────────────────────────────

function DecisionsFacet({ projectId }: { projectId: string }) {
  const [adrs, setAdrs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: "", context: "", decision: "", consequences: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/projects/${projectId}/adrs`)
      .then(r => r.json())
      .then(data => { setAdrs(data.adrs || []); setLoading(false) })
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
        {[["Total", adrs.length, "j-info"], ["Accepted", accepted, "j-pos"], ["Proposed", proposed, "j-warn"], ["Superseded", superseded, "j-muted"]].map(([l, v, t]) => (
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

  useEffect(() => {
    setLoading(true)
    // Fetch ideas promoted to this project + all non-promoted ideas
    Promise.all([
      fetch(`/api/ideas?projectId=${projectId}`).then(r => r.json()),
      fetch(`/api/ideas`).then(r => r.json()),
    ])
      .then(([promoted, all]) => {
        const promotedIds = new Set((promoted.data || []).map((i: any) => i.id))
        const promotedList = (promoted.data || [])
        const nonPromoted  = (all.data || []).filter((i: any) => !promotedIds.has(i.id) && i.lifecycle !== "promoted")
        setIdeas([...promotedList, ...nonPromoted])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  const promoteToTask = async (ideaId: string, title: string) => {
    setPromoting(ideaId)
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId, metadata: { sourceIdeaId: ideaId } }),
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
            <p className="j-card-sub">{ideas.filter(i => i.lifecycle !== "archived").length} active · promoted and in-flight ideas</p>
          </div>
          <button className="j-btn j-btn-ghost" onClick={() => router.push("/idea-incubator")}>Open incubator ↗</button>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="j-muted" style={{ fontSize: 13 }}>Loading ideas…</span>
          </div>
        ) : ideas.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: "0 0 12px" }}>No ideas yet. Capture your first one in the incubator.</p>
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


// ─── Agents ──────────────────────────────────────────────────────────────────

function AgentsFacet() {
  const [jobs, setJobs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: "", assignedTo: "" })
  const [saving, setSaving]   = useState(false)

  const fetchJobs = () => {
    setLoading(true)
    fetch("/api/agents/jobs?includeCompleted=true&limit=20")
      .then(r => r.json())
      .then(data => { setJobs(data.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchJobs() }, [])

  const dispatch = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/agents/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, createdBy: "user", assignedTo: form.assignedTo || undefined }),
      })
      if (res.ok) {
        fetchJobs()
        setForm({ title: "", assignedTo: "" })
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const tone: Record<string, string> = {
    pending: "j-muted", assigned: "j-info", in_progress: "j-proj",
    completed: "j-pos",  failed: "j-neg",  cancelled: "j-muted",
  }

  const active    = jobs.filter(j => j.status === "in_progress" || j.status === "assigned").length
  const completed = jobs.filter(j => j.status === "completed").length

  const elapsed = (job: any) => {
    if (!job.startedAt) return "—"
    const end  = job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
    const secs = Math.floor((end - new Date(job.startedAt).getTime()) / 1000)
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}m`
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
  }

  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[["Active", active, "j-proj"], ["Completed", completed, "j-pos"], ["Total jobs", jobs.length, "j-info"], ["Failed", jobs.filter(j => j.status === "failed").length, "j-neg"]].map(([l, v, t]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="j-card">
          <h4 className="j-card-title" style={{ marginBottom: 16 }}>Dispatch agent job</h4>
          <div className="j-col j-gap-3">
            <div>
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>Task</div>
              <input
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="What should the agent do?"
                style={{
                  width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)",
                  borderRadius: 7, padding: "8px 10px", fontSize: 13, color: "inherit",
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>Assign to (optional)</div>
              <input
                value={form.assignedTo}
                onChange={e => setForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                placeholder="Agent name or ID"
                style={{
                  width: "100%", background: "oklch(1 0 0 / 0.04)", border: "1px solid var(--j-ring)",
                  borderRadius: 7, padding: "8px 10px", fontSize: 13, color: "inherit",
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div className="j-row j-gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="j-btn j-btn-primary" onClick={dispatch} disabled={saving}>
                {saving ? "Dispatching…" : "Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Agent jobs</h3>
          <div className="j-row j-gap-2">
            <button className="j-btn j-btn-ghost" onClick={fetchJobs}>↺ Refresh</button>
            {!showForm && <button className="j-btn j-btn-primary" onClick={() => setShowForm(true)}>Dispatch agent</button>}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="j-muted" style={{ fontSize: 13 }}>Loading jobs…</span>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="j-muted" style={{ fontSize: 13, margin: "0 0 12px" }}>No agent jobs yet.</p>
            <button className="j-btn j-btn-primary" onClick={() => setShowForm(true)}>Dispatch first job</button>
          </div>
        ) : (
          <table className="j-table">
            <thead><tr><th>Agent</th><th>Task</th><th>Status</th><th>Priority</th><th>Elapsed</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id}>
                  <td>
                    <div className="j-row j-gap-2">
                      <div className="j-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>
                        {(j.assignedTo || j.agent?.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: 12 }}>{j.assignedTo || j.agent?.name || "Unassigned"}</span>
                    </div>
                  </td>
                  <td className="j-muted" style={{ fontSize: 12, maxWidth: 280 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {j.title}
                    </span>
                  </td>
                  <td>
                    <span className={`j-pill ${tone[j.status] || "j-muted"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {j.status === "in_progress" && <span className="j-dot-pulse" style={{ width: 6, height: 6 }} />}
                      {j.status.replace("_", " ")}
                    </span>
                  </td>
                  <td><span className="j-pill j-ghost" style={{ fontSize: 10 }}>{j.priority}</span></td>
                  <td className="j-muted j-num" style={{ fontSize: 12 }}>{elapsed(j)}</td>
                  <td className="j-muted" style={{ fontSize: 12 }}>{j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Notes ───────────────────────────────────────────────────────────────────

const NOTE_TYPES = ["note", "progress", "decision", "blocker"] as const
const NOTE_TYPE_TONE: Record<string, string> = {
  note: "j-ghost", progress: "j-info", decision: "j-proj", blocker: "j-neg",
}

function NotesFacet({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<string>("")
  const [form, setForm] = useState({ title: "", content: "", note_type: "note" as (typeof NOTE_TYPES)[number] })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/progress-notes?projectId=${projectId}&limit=100`)
      const j = await r.json()
      setNotes(Array.isArray(j.notes) ? j.notes : [])
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load notes")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const create = async () => {
    if (!form.content.trim()) { setErr("Note content is required"); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch("/api/progress-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          author_type: "human",
          author_name: "You",
          note_type: form.note_type,
          title: form.title.trim() || undefined,
          content: form.content.trim(),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to create note")
      setForm({ title: "", content: "", note_type: "note" })
      setShowForm(false)
      await fetchNotes()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create note")
    } finally {
      setSaving(false)
    }
  }

  const filtered = filter ? notes.filter(n => n.note_type === filter) : notes
  const count = (t: string) => notes.filter(n => n.note_type === t).length

  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
        <div className="j-row j-gap-2">
          <span className={`j-tab${filter === "" ? " j-active" : ""}`} onClick={() => setFilter("")}>
            All <b style={{ marginLeft: 6 }}>{notes.length}</b>
          </span>
          {NOTE_TYPES.map(t => (
            <span key={t} className={`j-tab${filter === t ? " j-active" : ""}`} onClick={() => setFilter(t)}>
              {t} <b style={{ marginLeft: 6 }}>{count(t)}</b>
            </span>
          ))}
        </div>
        <button className="j-btn j-btn-primary" onClick={() => { setShowForm(s => !s); setErr(null) }}>+ New note</button>
      </div>

      {showForm && (
        <div className="j-card">
          <div className="j-col j-gap-3">
            <input
              className="j-search"
              placeholder="Title (optional)"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <div className="j-row j-gap-2">
              <select
                className="j-search"
                value={form.note_type}
                onChange={e => setForm(f => ({ ...f, note_type: e.target.value as (typeof NOTE_TYPES)[number] }))}
              >
                {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <textarea
              placeholder="Note content (markdown supported)…"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={6}
              style={{
                width: "100%", background: "oklch(1 0 0 / 0.04)", color: "oklch(0.985 0 0)",
                border: "none", boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8,
                padding: 12, fontSize: 13, fontFamily: "var(--font-geist-mono, monospace)", resize: "vertical",
              }}
            />
            {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
            <div className="j-row j-gap-2">
              <button className="j-btn j-btn-primary" onClick={create} disabled={saving}>
                {saving ? "Saving…" : "Save note"}
              </button>
              <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="j-card"><span className="j-muted">Loading notes…</span></div>
      ) : filtered.length === 0 ? (
        <div className="j-card j-col" style={{ alignItems: "center", gap: 8, padding: 48, textAlign: "center" }}>
          <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>
            {filter ? `No ${filter} notes yet.` : "No notes yet. Capture your first progress note."}
          </p>
        </div>
      ) : (
        <div className="j-grid j-cols-2">
          {filtered.map(n => (
            <div key={n.id} className="j-card">
              <div className="j-row j-between" style={{ marginBottom: 8 }}>
                <div className="j-row j-gap-2" style={{ minWidth: 0 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.title || (n.content || "").slice(0, 60)}
                  </h4>
                  <span className={`j-pill ${NOTE_TYPE_TONE[n.note_type] || "j-ghost"}`} style={{ fontSize: 9 }}>{n.note_type}</span>
                </div>
                <span className="j-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
                </span>
              </div>
              {n.content && (
                <p className="j-muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "0 0 6px", whiteSpace: "pre-wrap" }}>
                  {n.content.length > 280 ? n.content.slice(0, 280) + "…" : n.content}
                </p>
              )}
              {n.author_name && (
                <span className="j-muted" style={{ fontSize: 11 }}>
                  — {n.author_name}{n.author_type === "agent" ? " (agent)" : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
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

  const goPrev = () => setNow(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNext = () => setNow(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => setNow(new Date())

  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div>
            <h3 className="j-card-title">Project calendar</h3>
            <p className="j-card-sub">
              {loading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"} this month · click a day to add one`}
            </p>
          </div>
          <div className="j-row j-gap-2">
            <button className="j-btn j-btn-ghost" onClick={goPrev}>←</button>
            <button className="j-btn j-btn-ghost" onClick={goToday}>{monthLabel}</button>
            <button className="j-btn j-btn-ghost" onClick={goNext}>→</button>
          </div>
        </div>
        <div className="j-cal-grid" style={{ gap: 6 }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} className="j-muted" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: 4 }}>{d}</div>
          ))}
          {Array.from({ length: totalCells }).map((_, i) => {
            const dayNum = i - leading + 1
            const inMonth = dayNum > 0 && dayNum <= daysInMonth
            const date = inMonth
              ? new Date(now.getFullYear(), now.getMonth(), dayNum).toISOString().slice(0, 10)
              : null
            const isToday = date === todayKey
            const dayEvents = date ? (eventsByDate[date] || []) : []
            const isSelected = selectedDate === date
            return (
              <div
                key={i}
                className={`j-cal-day${!inMonth ? " j-outside" : ""}${isToday ? " j-today" : ""}`}
                style={{
                  minHeight: 80,
                  cursor: inMonth ? "pointer" : "default",
                  boxShadow: isSelected ? "inset 0 0 0 2px var(--j-accent)" : undefined,
                }}
                onClick={() => inMonth && date && setSelectedDate(isSelected ? null : date)}
              >
                <span style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "var(--j-accent)" : "inherit" }}>
                  {inMonth ? dayNum : ""}
                </span>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 4, gap: 2 }}>
                  {dayEvents.slice(0, 3).map((e: any) => (
                    <div
                      key={e.id}
                      title={e.title}
                      onClick={(ev) => { ev.stopPropagation(); remove(e.id) }}
                      className="j-row j-gap-2"
                      style={{
                        padding: "2px 4px", borderRadius: 4,
                        background: "oklch(0.180 0 0)", boxShadow: "inset 0 0 0 1px var(--j-ring)",
                        fontSize: 9, cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--j-accent)", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="j-muted" style={{ fontSize: 9 }}>+{dayEvents.length - 3} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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

function RisksFacet({ projectId, project, onChange }: { projectId: string; project: any; onChange: () => void }) {
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

// ─── Links ───────────────────────────────────────────────────────────────────

function LinksFacet() {
  const links = [
    { id: "l1", title: "GitHub · project repository",   kind: "Repo",       url: "github.com/...",        status: "main · open PRs"         },
    { id: "l2", title: "Vercel deployment",             kind: "Deploy",     url: "vercel.app",            status: "live · last deploy 2h ago" },
    { id: "l3", title: "Figma design file",             kind: "Design",     url: "figma.com/...",         status: "updated 1d ago"           },
    { id: "l4", title: "Linear project board",          kind: "Tracker",    url: "linear.app/...",        status: "issues tracked"            },
    { id: "l5", title: "Stripe dashboard",              kind: "Payments",   url: "dashboard.stripe.com", status: "connected"                 },
    { id: "l6", title: "Sentry error monitoring",       kind: "Monitoring", url: "sentry.io/...",         status: "2 unresolved"              },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between">
        <div className="j-row j-gap-2">
          <span className="j-pill j-proj">All</span>
          <span className="j-pill j-ghost">Repo</span>
          <span className="j-pill j-ghost">Design</span>
        </div>
        <button className="j-btn j-btn-primary">+ Add link</button>
      </div>
      <div className="j-grid j-cols-2">
        {links.map(l => (
          <div key={l.id} className="j-card" style={{ cursor: "pointer" }}>
            <div className="j-row j-between">
              <div className="j-row j-gap-3" style={{ minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "oklch(1 0 0 / 0.05)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>↗</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</div>
                  <div className="j-muted" style={{ fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{l.url}</div>
                </div>
              </div>
            </div>
            <div className="j-row j-between" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--j-hairline)" }}>
              <span className="j-pill j-ghost">{l.kind}</span>
              <span className="j-muted" style={{ fontSize: 11 }}>{l.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProjectDashboardPage() {
  const params  = useParams()
  const router  = useRouter()
  const [activeTab, setActiveTab]     = useState("overview")
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

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!projectData?.steps) return { nodes: [], edges: [] }
    try { return transformStepsToFlow(projectData.steps) }
    catch { return { nodes: [], edges: [] } }
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

  const { project, steps, progressNotes } = projectData
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
        {activeTab === "overview"  && <OverviewFacet  project={project} progressNotes={progressNotes || []} />}
        {activeTab === "tasks"     && (
          <div style={{ height: "calc(100vh - 200px)" }}>
            <KanbanView projectId={projectId} onTaskSelect={() => {}} />
          </div>
        )}
        {activeTab === "roadmap"   && <RoadmapFacet   phases={phases} />}
        {activeTab === "gantt"     && (
          <div style={{ height: "calc(100vh - 200px)" }}>
            <GanttView projectId={projectId} onTaskSelect={() => {}} />
          </div>
        )}
        {activeTab === "flow"      && (
          <div style={{ height: "calc(100vh - 200px)" }}>
            <FlowView nodes={flowNodes} edges={flowEdges} projectId={projectId} onTaskSelect={() => {}} onRefresh={() => fetchProjectData(true)} />
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
        {activeTab === "agents"    && <AgentsFacet />}
        {activeTab === "notes"     && <NotesFacet projectId={projectId} />}
        {activeTab === "calendar"  && <CalendarFacet projectId={projectId} />}
        {activeTab === "metrics"   && <MetricsFacet project={project} steps={steps} />}
        {activeTab === "risks"     && <RisksFacet projectId={projectId} project={project} onChange={() => fetchProjectData(true)} />}
        {activeTab === "team"      && <TeamFacet />}
        {activeTab === "links"     && <LinksFacet />}
      </div>
    </div>
    </DashboardLayout>
  )
}
