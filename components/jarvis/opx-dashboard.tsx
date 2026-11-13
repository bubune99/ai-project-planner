"use client"

/*
 * Dashboard, rebuilt on the OpEx / Health & Habits system (owner 2026-11-13).
 * Every number comes from a live endpoint. The old dashboard showed invented
 * ones ("Momentum index", "$0 monthly income", "0/0 tasks"); nothing here is
 * estimated, and a number that can't be loaded shows "–".
 */

import Link from "next/link"
import { useState } from "react"
import { useUser } from "@stackframe/stack"
import { toast } from "sonner"
import { MeshBanner } from "./MeshBanner"
import { Section, ago, askAssistant, unwrap, useJson } from "@/components/project/opx/shared"

interface Project { id: string; name: string; description?: string | null; status?: string | null; progress?: number | null; updated_at?: string | null; updatedAt?: string | null }
interface Question { id: string; question: string; options: string[]; context?: string | null; projectName?: string | null }
interface FocusItem { id: string; title: string; dueDate?: string | null; project?: { id: string; name: string } | null }
interface Idea { id: string; title: string; createdAt?: string | null }

const active = (s?: string | null) => /progress|active/.test(s || "")

export function OpxDashboard() {
  const user = useUser()
  const projectsQ = useJson("/api/projects")
  const focusQ = useJson("/api/dashboard/focus")
  const inboxQ = useJson("/api/inbox")
  const ideasQ = useJson("/api/ideas")
  const todosQ = useJson("/api/todos?status=open&limit=1")
  const [answered, setAnswered] = useState<Record<string, string>>({})

  const projects = (unwrap<Project[]>(projectsQ.data) || []).filter((p) => p.status !== "archived")
  const moving = projects.filter((p) => active(p.status))
  const recent = [...moving].sort((a, b) => +new Date(b.updated_at || b.updatedAt || 0) - +new Date(a.updated_at || a.updatedAt || 0)).slice(0, 8)
  const questions = unwrap<Question[]>(inboxQ.data) || []
  const focus = unwrap<{ overdue?: FocusItem[]; blocked?: FocusItem[] }>(focusQ.data) || {}
  const overdue = focus.overdue || [], blocked = focus.blocked || []
  const ideas = unwrap<Idea[]>(ideasQ.data) || []
  const counts = (todosQ.data as any)?.meta?.counts || {}
  const n = (v: unknown, loading: boolean) => (typeof v === "number" ? v : loading ? "…" : "–")

  const hour = new Date().getHours()
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const first = (user?.displayName || "").split(" ")[0]

  const answer = async (q: Question, option: string) => {
    setAnswered((a) => ({ ...a, [q.id]: option }))
    try {
      const r = await fetch(`/api/inbox/${q.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      toast.success(`Answered: ${option}`); inboxQ.reload()
    } catch (e) {
      setAnswered((a) => { const { [q.id]: _, ...rest } = a; return rest })
      toast.error(e instanceof Error ? e.message : "Couldn't save the answer")
    }
  }
  const late = (d?: string | null) => { if (!d) return ""; const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000); return days > 0 ? `${days} day${days > 1 ? "s" : ""} late` : "" }
  const attention = [...blocked.map((b) => ({ ...b, blocked: true })), ...overdue.map((o) => ({ ...o, blocked: false }))].slice(0, 6)

  return (
    <div className="opx-page">
      <header className="opx-pbar opx-pbar-mesh" style={{ padding: "28px 30px" }}>
        <MeshBanner />
        <div style={{ flex: 1, minWidth: 300 }}>
          <div className="opx-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 style={{ fontSize: 40 }}>{greet}{first ? `, ${first}` : ""}</h1>
          <div className="opx-muted" style={{ fontSize: 15 }}>
            {n(questions.length, inboxQ.loading)} decisions waiting on you · {n(moving.length, projectsQ.loading)} projects moving · {n(counts.overdue, todosQ.loading)} overdue
          </div>
        </div>
        <div className="opx-stats">
          <div className="opx-stat"><b>{n(moving.length, projectsQ.loading)}</b><span>Active projects</span></div>
          <div className="opx-stat"><b>{n(questions.length, inboxQ.loading)}</b><span>Waiting on you</span></div>
          <div className="opx-stat"><b>{n(counts.active, todosQ.loading)}</b><span>Open todos</span></div>
          <div className={`opx-stat${counts.overdue ? " hot" : ""}`}><b>{n(counts.overdue, todosQ.loading)}</b><span>Overdue</span></div>
          <div className="opx-stat"><b>{n(ideas.length, ideasQ.loading)}</b><span>Ideas</span></div>
        </div>
      </header>

      <div className="opx-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Link className="opx-btn" href="/todos">New task</Link>
        <Link className="opx-btn" href="/ideas">Capture an idea</Link>
        <button className="opx-btn" onClick={() => askAssistant("Help me log a decision: ask me what I decided, why, and which options I weighed, then record it on the right project.")}>Log a decision</button>
        <button className="opx-btn" onClick={() => askAssistant("Plan my week: pick from open steps and todos across projects, most urgent first, and show me the plan before changing anything.")}>Plan my week</button>
      </div>

      <div className="opx-2col" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <Section title="Needs you" count={questions.length} action={<Link className="opx-link" href="/inbox">Open inbox ›</Link>}>
          {inboxQ.loading && !inboxQ.data && <p className="opx-muted">Loading…</p>}
          {!inboxQ.loading && questions.length === 0 && <p className="opx-muted" style={{ margin: 0 }}>Nothing is waiting on you.</p>}
          {questions.slice(0, 3).map((q) => (
            <div key={q.id} className="opx-card" style={{ marginBottom: 8 }}>
              <div className="opx-muted" style={{ fontSize: 12.5 }}>{q.projectName || "Planner"}</div>
              <b style={{ display: "block", fontSize: 15, margin: "2px 0" }}>{q.question}</b>
              {q.context && <p className="opx-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{q.context.replace(/\[[a-z-]+:[^\]]+\]/g, "").slice(0, 190)}</p>}
              <span className="opx-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {q.options.slice(0, 4).map((o, k) => (
                  <button key={o} className={`opx-btn sm${k === 0 ? " primary" : ""}`} disabled={!!answered[q.id]} onClick={() => answer(q, o)}>{answered[q.id] === o ? `✓ ${o}` : o}</button>
                ))}
              </span>
            </div>
          ))}
        </Section>
        <Section title="Overdue and blocked" count={typeof counts.overdue === "number" ? counts.overdue + blocked.length : attention.length} action={<Link className="opx-link" href="/todos">Open Today ›</Link>}>
          {focusQ.error && <p className="opx-muted">Couldn't load this: {focusQ.error}</p>}
          {!focusQ.loading && !focusQ.error && attention.length === 0 && <p className="opx-muted" style={{ margin: 0 }}>Nothing overdue or blocked.</p>}
          {attention.map((t) => (
            <div key={t.id} className="opx-li">
              <i className="opx-dot" style={{ background: t.blocked ? "var(--opx-warn)" : "var(--opx-hot)" }} />
              <div><b>{t.title.replace(/^\[blocked\]\s*/i, "")}</b><small>{t.project?.name || ""}{t.blocked ? " · blocked" : ""}</small></div>
              <span style={{ fontSize: 13, color: t.blocked ? "var(--opx-warn)" : "var(--opx-hot)", whiteSpace: "nowrap" }}>{t.blocked ? "Blocked" : late(t.dueDate)}</span>
            </div>
          ))}
        </Section>
      </div>

      <Section title="Projects" count={`${moving.length} active`} action={<Link className="opx-link" href="/projects">View all ›</Link>}>
        {projectsQ.loading && !projectsQ.data && <p className="opx-muted">Loading…</p>}
        <div className="opx-projs">
          {recent.map((p) => {
            const pct = Math.round(p.progress ?? 0)
            return (
              <Link key={p.id} href={`/project/${p.id}`} className="opx-pc">
                <span className="opx-chip" style={{ alignSelf: "flex-start" }}><i className="opx-dot" style={{ background: "var(--opx-good)", width: 6, height: 6 }} />In progress</span>
                <b>{p.name}</b>
                <p className="opx-muted">{(p.description || "").slice(0, 120)}</p>
                <span className="opx-row opx-muted" style={{ fontSize: 12.5, marginTop: "auto" }}><span>{pct}% done</span><span style={{ marginLeft: "auto" }}>{ago(p.updated_at || p.updatedAt)}</span></span>
                <span className="opx-pg"><i style={{ width: `${pct}%` }} /></span>
              </Link>
            )
          })}
        </div>
      </Section>

      <Section title="Latest ideas" count={ideas.length} action={<Link className="opx-link" href="/ideas">All ideas ›</Link>}>
        {ideas.slice(0, 6).map((i) => (
          <Link key={i.id} href={`/ideas/${i.id}`} className="opx-li" style={{ color: "inherit", textDecoration: "none" }}>
            <i className="opx-dot" style={{ background: "var(--opx-accent)" }} />
            <div><b>{i.title}</b><small>{ago(i.createdAt)}</small></div>
          </Link>
        ))}
        {!ideasQ.loading && ideas.length === 0 && <p className="opx-muted" style={{ margin: 0 }}>No ideas yet.</p>}
      </Section>
    </div>
  )
}
