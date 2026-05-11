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

function DecisionsFacet() {
  const adrs = [
    { id: "d1", num: "001", title: "Primary framework selection",   status: "accepted",  date: "Apr 28", impact: "high", author: "You" },
    { id: "d2", num: "002", title: "Database schema approach",       status: "accepted",  date: "May 1",  impact: "high", author: "Claude" },
    { id: "d3", num: "003", title: "Authentication strategy",        status: "accepted",  date: "May 4",  impact: "med",  author: "You" },
    { id: "d4", num: "004", title: "API design pattern",             status: "proposed",  date: "May 9",  impact: "med",  author: "Claude" },
    { id: "d5", num: "005", title: "State management approach",      status: "proposed",  date: "May 10", impact: "low",  author: "You" },
    { id: "d6", num: "006", title: "Original CSS-in-JS approach",    status: "superseded",date: "Apr 20", impact: "low",  author: "You" },
  ]
  const tone: Record<string, string>     = { accepted: "j-pos", proposed: "j-warn", superseded: "j-muted", rejected: "j-neg" }
  const impactTone = (i: string) => i === "high" ? "j-warn" : i === "med" ? "j-info" : "j-muted"
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[["Total", adrs.length, "j-info"], ["Accepted", 3, "j-pos"], ["Proposed", 2, "j-warn"], ["Superseded", 1, "j-muted"]].map(([l, v, t]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Architecture decisions</h3>
          <button className="j-btn j-btn-primary">+ New ADR</button>
        </div>
        <table className="j-table">
          <thead><tr><th>#</th><th>Decision</th><th>Status</th><th>Impact</th><th>Author</th><th>Date</th></tr></thead>
          <tbody>
            {adrs.map(a => (
              <tr key={a.id}>
                <td className="j-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>ADR-{a.num}</td>
                <td style={{ fontWeight: 500 }}>{a.title}</td>
                <td><span className={`j-pill ${tone[a.status]}`}>{a.status}</span></td>
                <td><span className={`j-pill ${impactTone(a.impact)}`}>{a.impact}</span></td>
                <td className="j-muted">{a.author}</td>
                <td className="j-muted" style={{ fontSize: 12 }}>{a.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

function IdeasFacet() {
  const linked = [
    { id: "i1", title: "Automate onboarding step with AI assistant", heat: 8, source: "User research",    age: "2d", state: "exploring" },
    { id: "i2", title: "Add in-app milestone celebrations",           heat: 6, source: "Product review",   age: "1w", state: "ready to promote" },
    { id: "i3", title: "Weekly digest email report",                  heat: 5, source: "Customer feedback",age: "3d", state: "exploring" },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div><h3 className="j-card-title">Linked ideas</h3><p className="j-card-sub">{linked.length} active · cross-linked from project research</p></div>
          <button className="j-btn j-btn-ghost">Browse all</button>
        </div>
        <div className="j-col j-gap-3">
          {linked.map(i => (
            <div key={i.id} className="j-card j-tight" style={{ padding: 14, background: "oklch(1 0 0 / 0.03)" }}>
              <div className="j-row j-between" style={{ marginBottom: 8 }}>
                <div className="j-row j-gap-2">
                  <span className="j-pill j-idea">heat {i.heat}/10</span>
                  <span className="j-pill j-ghost">{i.state}</span>
                </div>
                <span className="j-muted" style={{ fontSize: 11 }}>{i.age}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{i.title}</div>
              <div className="j-muted" style={{ fontSize: 12 }}>From: {i.source}</div>
              <div className="j-row j-gap-2" style={{ marginTop: 10 }}>
                <button className="j-btn j-btn-primary">Promote to task</button>
                <button className="j-btn j-btn-ghost">Open in incubator</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Finance ─────────────────────────────────────────────────────────────────

function FinanceFacet() {
  const breakdown = [
    { l: "AI agent runs",        v: 6240, c: "var(--j-proj)" },
    { l: "Design work",          v: 4800, c: "var(--j-biz)"  },
    { l: "Infrastructure",       v: 2150, c: "var(--j-info)" },
    { l: "Tools & subscriptions",v: 1430, c: "var(--j-idea)" },
    { l: "Miscellaneous",        v: 800,  c: "var(--j-muted)"},
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[
          { l: "Budget",      v: "$24,000", s: "approved",        t: "j-info" },
          { l: "Spent",       v: "$15,420", s: "64% used",        t: "j-warn" },
          { l: "Burn / week", v: "$2,100",  s: "trending",        t: "j-info" },
          { l: "Runway",      v: "4w left", s: "at current pace", t: "j-warn" },
        ].map(c => (
          <div key={c.l} className="j-card j-tight" style={{ padding: 16 }}>
            <div className="j-eyebrow">{c.l}</div>
            <div className="j-amount-lg" style={{ marginTop: 8 }}>{c.v}</div>
            <span className={`j-pill ${c.t}`} style={{ marginTop: 6 }}>{c.s}</span>
          </div>
        ))}
      </div>
      <div className="j-split">
        <div className="j-card">
          <div className="j-card-head"><div><h3 className="j-card-title">Cost breakdown</h3><p className="j-card-sub">Where the budget has gone</p></div></div>
          {breakdown.map((r, i) => (
            <div key={i} className="j-row j-gap-3" style={{ padding: "10px 0", borderBottom: i < breakdown.length - 1 ? "1px solid var(--j-hairline)" : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: r.c, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{r.l}</span>
              <div style={{ flex: 1, maxWidth: 180 }}>
                <div className="j-progress j-thick">
                  <span style={{ width: `${(r.v / 6240) * 100}%`, background: r.c }} />
                </div>
              </div>
              <span className="j-num" style={{ fontSize: 12.5, fontWeight: 500, minWidth: 60, textAlign: "right" }}>${r.v.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="j-col j-gap-4">
          <div className="j-card">
            <div className="j-card-head"><div><h3 className="j-card-title">Projected return</h3></div></div>
            <div className="j-amount-xl" style={{ color: "var(--j-pos)" }}>+$84K</div>
            <div className="j-muted" style={{ fontSize: 12, marginTop: 4 }}>activation lift × 12mo CLV</div>
            <hr className="j-divider" style={{ margin: "14px 0" }} />
            <div className="j-row j-between">
              <span className="j-muted" style={{ fontSize: 12 }}>ROI multiple</span>
              <span className="j-num" style={{ fontSize: 13, fontWeight: 500, color: "var(--j-pos)" }}>5.4×</span>
            </div>
          </div>
          <div className="j-coming-soon" style={{ padding: 24 }}>
            <p className="j-muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>Full finance dashboard lives separately.</p>
            <button className="j-btn j-btn-ghost">Open Finance</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Agents ──────────────────────────────────────────────────────────────────

function AgentsFacet() {
  const runs = [
    { id: "r1", agent: "Claude", task: "Analyze project requirements and write spec",  status: "running", elapsed: "8m",    tokens: 12400, cost: "$0.12" },
    { id: "r2", agent: "v0",     task: "Generate UI components for dashboard view",    status: "running", elapsed: "22m",   tokens: 8600,  cost: "$0.21" },
    { id: "r3", agent: "Claude", task: "Code review and architecture suggestions",     status: "done",    elapsed: "1h 4m", tokens: 24800, cost: "$0.34" },
    { id: "r4", agent: "GPT",    task: "Generate integration test cases",              status: "done",    elapsed: "12m",   tokens: 6400,  cost: "$0.08" },
    { id: "r5", agent: "Claude", task: "Document API endpoints and response shapes",   status: "queued",  elapsed: "—",     tokens: 0,     cost: "$0.00" },
  ]
  const tone: Record<string, string> = { running: "j-proj", done: "j-pos", queued: "j-muted", error: "j-neg" }
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[["Active", 2, "j-proj"], ["Completed today", 7, "j-pos"], ["Token spend · 24h", "62.4K", "j-info"], ["Cost · 24h", "$1.42", "j-warn"]].map(([l, v, t]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Agent runs</h3>
          <button className="j-btn j-btn-primary">Dispatch agent</button>
        </div>
        <table className="j-table">
          <thead><tr><th>Agent</th><th>Task</th><th>Status</th><th>Elapsed</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id}>
                <td>
                  <div className="j-row j-gap-2">
                    <div className="j-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{r.agent.slice(0, 2).toUpperCase()}</div>
                    <span style={{ fontWeight: 500 }}>{r.agent}</span>
                  </div>
                </td>
                <td className="j-muted" style={{ fontSize: 12 }}>{r.task}</td>
                <td>
                  <span className={`j-pill ${tone[r.status]}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {r.status === "running" && <span className="j-dot-pulse" style={{ width: 6, height: 6 }} />}
                    {r.status}
                  </span>
                </td>
                <td className="j-muted j-num" style={{ fontSize: 12 }}>{r.elapsed}</td>
                <td className="j-num j-muted">{r.tokens.toLocaleString()}</td>
                <td className="j-num">{r.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function NotesFacet() {
  const notes = [
    { id: "n1", title: "Customer feedback · initial review",  date: "May 9",  excerpt: "Users want faster onboarding. The current flow is too long — consider condensing to 3 steps max.",                tags: ["feedback","ux"],       pinned: true  },
    { id: "n2", title: "Sprint review thoughts",              date: "May 7",  excerpt: "Progress is solid but the API integration needs more focus. Consider pairing sessions with the agent.",           tags: ["sprint"],              pinned: false },
    { id: "n3", title: "Architecture decision notes",         date: "May 5",  excerpt: "Sticking with server actions over API routes significantly simplified the codebase. No regrets.",                  tags: ["arch","decisions"],    pinned: true  },
    { id: "n4", title: "Brand consistency reminder",          date: "May 3",  excerpt: "Use sentence case throughout. Consistent icon library. No mixing of design systems.",                              tags: ["brand"],               pinned: false },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between">
        <div className="j-row j-gap-2">
          <span className="j-pill j-proj">All</span>
          <span className="j-pill j-ghost">Pinned</span>
          <span className="j-pill j-ghost">Feedback</span>
          <span className="j-pill j-ghost">Arch</span>
        </div>
        <button className="j-btn j-btn-primary">+ New note</button>
      </div>
      <div className="j-grid j-cols-2">
        {notes.map(n => (
          <div key={n.id} className="j-card">
            <div className="j-row j-between" style={{ marginBottom: 8 }}>
              <div className="j-row j-gap-2">
                <h4 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{n.title}</h4>
                {n.pinned && <span className="j-pill j-warn" style={{ fontSize: 9 }}>pinned</span>}
              </div>
              <span className="j-muted" style={{ fontSize: 11 }}>{n.date}</span>
            </div>
            <p className="j-muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "0 0 10px" }}>{n.excerpt}</p>
            <div className="j-row j-wrap j-gap-2">
              {n.tags.map(t => <span key={t} className="j-pill j-ghost" style={{ fontSize: 10 }}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarFacet() {
  const today = new Date().getDate()
  const events: Record<number, { c: string; t: string }[]> = {
    5:  [{ c: "j-proj", t: "Phase start" }],
    10: [{ c: "j-proj", t: "Sync" }, { c: "j-idea", t: "Idea triage" }],
    15: [{ c: "j-pos",  t: "Milestone" }],
    18: [{ c: "j-warn", t: "Phase end" }],
    22: [{ c: "j-neg",  t: "QA deadline" }],
    26: [{ c: "j-pos",  t: "Launch" }],
  }
  return (
    <div className="j-col j-gap-4">
      <div className="j-card">
        <div className="j-card-head">
          <div><h3 className="j-card-title">Project calendar</h3><p className="j-card-sub">Milestones, deadlines, and time blocks</p></div>
        </div>
        <div className="j-cal-grid" style={{ gap: 6 }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} className="j-muted" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: 4 }}>{d}</div>
          ))}
          {Array.from({ length: 35 }).map((_, i) => {
            const d = i - 3
            const inMonth = d > 0 && d <= 31
            const isToday = d === today
            const evts = events[d] || []
            return (
              <div key={i} className={`j-cal-day${!inMonth ? " j-outside" : ""}${isToday ? " j-today" : ""}`} style={{ minHeight: 70 }}>
                <span style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "var(--j-accent)" : "inherit" }}>
                  {inMonth ? d : ""}
                </span>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 4, gap: 2 }}>
                  {evts.map((e, j) => (
                    <div key={j} className="j-row j-gap-2" style={{ padding: "2px 4px", borderRadius: 4, background: "oklch(0.180 0 0)", boxShadow: "inset 0 0 0 1px var(--j-ring)", fontSize: 9 }}>
                      <span style={{ width: 4, height: 4, borderRadius: 999, background: `var(--${e.c})`, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function MetricsFacet() {
  const kpis = [
    { l: "Completion rate", v: "47%", d: "+9pp",  t: "j-pos", target: "60%" },
    { l: "Tasks per week",  v: "8.2", d: "+2.1",  t: "j-pos", target: "10"  },
    { l: "Velocity",        v: "3.1", d: "−0.3",  t: "j-neg", target: "4"   },
    { l: "Time to close",   v: "4d",  d: "−1d",   t: "j-pos", target: "3d"  },
  ]
  const trend = [12, 18, 15, 22, 19, 25, 28, 24, 32, 38, 36, 42, 47]
  const max = Math.max(...trend)
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {kpis.map(k => (
          <div key={k.l} className="j-card">
            <div className="j-eyebrow">{k.l}</div>
            <div className="j-amount-xl" style={{ marginTop: 8 }}>{k.v}</div>
            <div className="j-row j-between" style={{ marginTop: 8 }}>
              <span className={`j-pill ${k.t}`}>{k.d}</span>
              <span className="j-muted" style={{ fontSize: 11 }}>goal {k.target}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="j-card">
        <div className="j-card-head">
          <div><h3 className="j-card-title">Completion rate · last 13 weeks</h3><p className="j-card-sub">Trend toward 60% target</p></div>
        </div>
        <div style={{ position: "relative", height: 200, paddingTop: 20 }}>
          <div style={{ position: "absolute", inset: 20, borderBottom: "1px solid var(--j-hairline)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: "33%", borderTop: "1px dashed oklch(1 0 0 / 0.1)" }}>
            <span className="j-muted" style={{ fontSize: 10, marginLeft: 4, background: "var(--j-surface)", padding: "0 4px" }}>target · 60%</span>
          </div>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="metric-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.870 0.045 252 / 0.35)" />
                <stop offset="100%" stopColor="oklch(0.870 0.045 252 / 0)" />
              </linearGradient>
            </defs>
            <polyline fill="none" stroke="oklch(0.870 0.045 252)" strokeWidth="0.6"
              points={trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${100 - (v / max) * 70 - 15}`).join(" ")} />
            <polygon fill="url(#metric-grad)"
              points={`0,100 ${trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${100 - (v / max) * 70 - 15}`).join(" ")} 100,100`} />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── Risks ───────────────────────────────────────────────────────────────────

function RisksFacet() {
  const risks = [
    { id: "r1", title: "Scope creep beyond MVP definition",       sev: "high", lik: "high", owner: "You",    mitig: "Weekly scope reviews",             status: "monitoring"  },
    { id: "r2", title: "External API rate limits at launch",      sev: "med",  lik: "med",  owner: "Claude", mitig: "Implement caching + retry logic",   status: "mitigating"  },
    { id: "r3", title: "Tech debt accumulation in core modules",  sev: "med",  lik: "high", owner: "You",    mitig: "Allocate 20% refactor time",        status: "open"        },
    { id: "r4", title: "Dependency version conflicts",            sev: "low",  lik: "med",  owner: "Claude", mitig: "Pin major versions, audit quarterly",status: "scheduled"   },
  ]
  const sevTone: Record<string, string> = { high: "j-neg", med: "j-warn", low: "j-info" }
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-4">
        {[["High", 1, "j-neg"], ["Medium", 2, "j-warn"], ["Low", 1, "j-info"], ["Mitigated", 1, "j-pos"]].map(([l, v, t]) => (
          <div key={l as string} className="j-card j-tight" style={{ padding: 14 }}>
            <div className="j-eyebrow">{l}</div>
            <div className="j-amount-lg" style={{ marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="j-card" style={{ padding: 0 }}>
        <div className="j-row j-between" style={{ padding: 16 }}>
          <h3 className="j-card-title">Risk register</h3>
          <button className="j-btn j-btn-primary">+ New risk</button>
        </div>
        <table className="j-table">
          <thead><tr><th>Risk</th><th>Severity</th><th>Likelihood</th><th>Owner</th><th>Mitigation</th><th>Status</th></tr></thead>
          <tbody>
            {risks.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.title}</td>
                <td><span className={`j-pill ${sevTone[r.sev]}`}>{r.sev}</span></td>
                <td><span className={`j-pill ${sevTone[r.lik]}`}>{r.lik}</span></td>
                <td className="j-muted">{r.owner}</td>
                <td className="j-muted" style={{ fontSize: 12 }}>{r.mitig}</td>
                <td><span className="j-pill j-ghost">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Team ────────────────────────────────────────────────────────────────────

function TeamFacet() {
  const team = [
    { id: "u1", n: "You",    r: "Operator",       load: 80, status: "deep work", contrib: 142, kind: "human" },
    { id: "u2", n: "Claude", r: "Engineering",    load: 65, status: "running",   contrib: 86,  kind: "agent" },
    { id: "u3", n: "v0",     r: "UI/UX agent",    load: 40, status: "running",   contrib: 52,  kind: "agent" },
    { id: "u4", n: "GPT",    r: "Research",       load: 15, status: "idle",      contrib: 18,  kind: "agent" },
  ]
  return (
    <div className="j-col j-gap-4">
      <div className="j-grid j-cols-3">
        {team.map(m => (
          <div key={m.id} className="j-card">
            <div className="j-row j-gap-3" style={{ marginBottom: 12 }}>
              <div className="j-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>{m.n.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{m.n}</div>
                <div className="j-muted" style={{ fontSize: 11 }}>{m.r}</div>
              </div>
              <span className={`j-pill ${m.kind === "agent" ? "j-proj" : "j-biz"}`} style={{ fontSize: 9 }}>{m.kind}</span>
            </div>
            <div className="j-row j-between" style={{ marginBottom: 4 }}>
              <span className="j-muted" style={{ fontSize: 11 }}>Load</span>
              <span className="j-num" style={{ fontSize: 11 }}>{m.load}%</span>
            </div>
            <div className="j-progress j-thick" style={{ marginBottom: 12 }}>
              <span style={{ width: `${m.load}%`, background: m.load > 75 ? "var(--j-warn)" : "var(--j-accent)" }} />
            </div>
            <div className="j-row j-between">
              <span className="j-pill j-ghost">{m.status}</span>
              <span className="j-muted" style={{ fontSize: 11 }}>{m.contrib} contribs</span>
            </div>
          </div>
        ))}
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

      {/* Facet content */}
      <div style={{ padding: "24px 32px", maxWidth: 1440, margin: "0 auto" }}>
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
        {activeTab === "decisions" && <DecisionsFacet />}
        {activeTab === "ideas"     && <IdeasFacet />}
        {activeTab === "finance"   && <FinanceFacet />}
        {activeTab === "agents"    && <AgentsFacet />}
        {activeTab === "notes"     && <NotesFacet />}
        {activeTab === "calendar"  && <CalendarFacet />}
        {activeTab === "metrics"   && <MetricsFacet />}
        {activeTab === "risks"     && <RisksFacet />}
        {activeTab === "team"      && <TeamFacet />}
        {activeTab === "links"     && <LinksFacet />}
      </div>
    </div>
    </DashboardLayout>
  )
}
