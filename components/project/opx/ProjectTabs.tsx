"use client"

/*
 * Metrics, Money and Settings tabs (owner 2026-11-13).
 * Money and the new settings live in projects.metadata.planner_ui, written
 * through the existing PATCH /api/projects/:id (it replaces metadata whole,
 * so every write merges onto the current metadata first).
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { projectMetrics, medianLabel } from "@/lib/project-views/metrics"
import { CORE_SLOTS } from "./DocsTab"
import { Failed, Loading, Section, ago, fmtDate, unwrap, useJson } from "./shared"

export interface PlannerUi {
  coreDocs?: string[]
  defaultTab?: string
  defaultTaskView?: string
  decisionsView?: "pipeline" | "timeline"
  progressCountsSubtasks?: boolean
  liveUrl?: string
  stagingUrl?: string
  money?: {
    currency?: string
    budget?: number | null
    budgetPeriod?: "month" | "total"
    warnAt?: number
    costs?: { id: string; name: string; service: string; monthly: number | null }[]
    putIn?: { id: string; date: string; amount: number; note: string }[]
    broughtIn?: { id: string; date: string; amount: number; note: string }[]
  }
}

export const uiOf = (project: any): PlannerUi => (project?.metadata?.planner_ui as PlannerUi) || {}

async function saveProject(projectId: string, project: any, patch: Record<string, unknown>, ui?: Partial<PlannerUi>) {
  const body: Record<string, unknown> = { ...patch }
  if (ui) body.metadata = { ...(project?.metadata || {}), planner_ui: { ...uiOf(project), ...ui } }
  const r = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
}

const uid = () => Math.random().toString(36).slice(2, 10)

// ─── Metrics ────────────────────────────────────────────────────────────────

export function MetricsTab({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useJson(`/api/projects/${projectId}/steps`)
  const m = useMemo(() => projectMetrics(unwrap<any[]>(data, "steps") || [], new Date()), [data])
  if (loading && !data) return <Loading what="metrics" />
  if (error) return <Failed what="metrics" error={error} retry={reload} />
  const max = Math.max(1, ...m.weeks.flatMap((w) => [w.added, w.done]))
  const diff = m.doneLast4 - m.donePrev4
  const stale = m.lastDone && Date.now() - +m.lastDone > 21 * 86_400_000
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-stats">
        <div className="opx-stat"><b>{m.doneLast4}</b><span>Done in the last 4 weeks{m.donePrev4 || m.doneLast4 ? ` (${diff >= 0 ? "+" : ""}${diff} vs the 4 before)` : ""}</span></div>
        <div className="opx-stat"><b>{medianLabel(m.medianDays)}</b><span>Typical time to finish{m.medianDays != null && m.medianDays < 1 ? ": most tasks are logged after the work is done" : ""}</span></div>
        <div className="opx-stat"><b>{m.inProgress}</b><span>In progress now</span></div>
        <div className={`opx-stat${m.ages[3].count ? " hot" : ""}`}><b>{m.ages[3].count}</b><span>Open over 3 months</span></div>
      </div>
      <div className="opx-2col">
        <Section title="Added vs done, by week" action={<span className="opx-row opx-muted" style={{ fontSize: 12.5, gap: 12 }}><span className="opx-row" style={{ gap: 5 }}><i className="opx-dot" style={{ background: "color-mix(in srgb, var(--opx-accent) 45%, transparent)", borderRadius: 3 }} />Added</span><span className="opx-row" style={{ gap: 5 }}><i className="opx-dot" style={{ background: "var(--opx-good)", borderRadius: 3 }} />Done</span></span>}>
          <div className="opx-chart" role="img" aria-label={`Tasks added and done per week over the last 12 weeks. ${m.weeks.map((w) => `Week of ${w.week}: ${w.added} added, ${w.done} done`).join(". ")}`}>
            {m.weeks.map((w) => (
              <div key={w.week} className="opx-bw">
                <div className="opx-bs">
                  <i title={`${w.added} added`} style={{ height: `${(w.added / max) * 100}%`, background: "color-mix(in srgb, var(--opx-accent) 45%, transparent)" }} />
                  <i title={`${w.done} done`} style={{ height: `${(w.done / max) * 100}%`, background: "var(--opx-good)" }} />
                </div>
                <small>{fmtDate(w.week + "T12:00:00")}</small>
              </div>
            ))}
          </div>
        </Section>
        <Section title="How old is the open work?" count={`${m.open} open`}>
          {m.ages.map((a) => (
            <div key={a.label} className="opx-agr">
              <span>{a.label}</span>
              <span className="opx-pg" style={{ height: 9 }}><i style={{ width: `${m.open ? (a.count / m.open) * 100 : 0}%`, background: a.label.startsWith("Over") ? "var(--opx-hot)" : "var(--opx-accent)" }} /></span>
              <b>{a.count}</b>
            </div>
          ))}
          <p className="opx-muted" style={{ fontSize: 12.5, margin: "14px 0 0" }}>Worked out from each task's created and completed dates. Nothing here is estimated.</p>
          {stale && (
            <div className="opx-empty" style={{ textAlign: "left", marginTop: 12 }}>
              <b style={{ color: "var(--opx-ink)" }}>No task marked done since {fmtDate(m.lastDone!)}.</b> If work shipped since then, its tasks weren't closed. Agents should close a task when they ship it.
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── Money ──────────────────────────────────────────────────────────────────

export function MoneyTab({ projectId, project, onChange }: { projectId: string; project: any; onChange: () => void }) {
  const money = uiOf(project).money || {}
  const cur = money.currency || "USD"
  const fmt = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n))
  const costs = money.costs || [], putIn = money.putIn || [], brought = money.broughtIn || []
  const monthly = costs.reduce((a, c) => a + (c.monthly || 0), 0)
  const hasMonthly = costs.some((c) => c.monthly != null)
  const sum = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0)
  const [form, setForm] = useState<{ kind: "cost" | "in" | "out" | "budget" | null; a: string; b: string; c: string }>({ kind: null, a: "", b: "", c: "" })
  const [busy, setBusy] = useState(false)
  const write = async (next: PlannerUi["money"]) => {
    setBusy(true)
    try { await saveProject(projectId, project, {}, { money: { ...money, ...next } }); onChange(); setForm({ kind: null, a: "", b: "", c: "" }) }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save") }
    finally { setBusy(false) }
  }
  const num = (s: string) => { const n = Number(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && s.trim() ? n : null }
  const today = new Date().toISOString().slice(0, 10)
  const budgetUsed = money.budget && money.budgetPeriod !== "total" && hasMonthly ? monthly / money.budget : null
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-stats">
        <div className={`opx-stat${budgetUsed != null && budgetUsed * 100 >= (money.warnAt ?? 80) ? " hot" : ""}`}><b>{money.budget != null ? fmt(money.budget) : "—"}</b><span>Budget{money.budget != null ? (money.budgetPeriod === "total" ? ", total" : " per month") : ""}</span></div>
        <div className="opx-stat"><b>{hasMonthly ? fmt(monthly) : "—"}</b><span>Costs to run, per month</span></div>
        <div className="opx-stat"><b>{putIn.length ? fmt(sum(putIn)) : "—"}</b><span>Put in so far</span></div>
        <div className="opx-stat"><b>{brought.length ? fmt(sum(brought)) : "—"}</b><span>Brought in so far</span></div>
      </div>
      <div className="opx-2col">
        <Section title="What it costs to run" action={<button className="opx-link" onClick={() => setForm({ kind: "cost", a: "", b: "", c: "" })}>＋ Add a cost</button>}>
          {costs.length === 0 && form.kind !== "cost" && <p className="opx-muted" style={{ margin: 0 }}>No running costs recorded. Add the services this project pays for (hosting, database, email, domain) and what each costs a month.</p>}
          {costs.map((c) => (
            <div key={c.id} className="opx-li">
              <div><b>{c.name}</b><small>{c.service}</small></div>
              <span>{c.monthly != null ? `${fmt(c.monthly)} / month` : "— / month"}</span>
              <button className="opx-btn sm" disabled={busy} onClick={() => write({ costs: costs.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.name}`}>Remove</button>
            </div>
          ))}
          {form.kind === "cost" && (
            <form className="opx-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); if (form.a.trim()) write({ costs: [...costs, { id: uid(), name: form.a.trim(), service: form.b.trim(), monthly: num(form.c) }] }) }}>
              <input className="opx-input" style={{ width: 160 }} placeholder="What (e.g. Hosting)" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} aria-label="Cost name" autoFocus />
              <input className="opx-input" style={{ width: 200 }} placeholder="Service (e.g. Vercel)" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} aria-label="Service" />
              <input className="opx-input" style={{ width: 130 }} placeholder="Per month" inputMode="decimal" value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value })} aria-label="Monthly cost" />
              <button className="opx-btn primary" disabled={busy}>Add</button><button type="button" className="opx-btn" onClick={() => setForm({ kind: null, a: "", b: "", c: "" })}>Cancel</button>
            </form>
          )}
        </Section>
        <div className="opx-col" style={{ gap: 12 }}>
          <Section title="Budget" action={<button className="opx-link" onClick={() => setForm({ kind: "budget", a: money.budget != null ? String(money.budget) : "", b: money.budgetPeriod || "month", c: String(money.warnAt ?? 80) })}>{money.budget != null ? "Change" : "Set a budget"}</button>}>
            {form.kind === "budget" ? (
              <form className="opx-row" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); write({ budget: num(form.a), budgetPeriod: form.b === "total" ? "total" : "month", warnAt: num(form.c) ?? 80 }) }}>
                <input className="opx-input" style={{ width: 130 }} placeholder="Amount" inputMode="decimal" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} aria-label="Budget amount" autoFocus />
                <select className="opx-input" style={{ width: 130 }} value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} aria-label="Budget period"><option value="month">per month</option><option value="total">in total</option></select>
                <input className="opx-input" style={{ width: 110 }} value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value })} aria-label="Warn at percent" />
                <span className="opx-muted" style={{ fontSize: 12.5 }}>% warning</span>
                <button className="opx-btn primary" disabled={busy}>Save</button><button type="button" className="opx-btn" onClick={() => setForm({ kind: null, a: "", b: "", c: "" })}>Cancel</button>
              </form>
            ) : money.budget != null ? (
              <p style={{ margin: 0 }}>{fmt(money.budget)} {money.budgetPeriod === "total" ? "in total" : "per month"}{budgetUsed != null ? ` · running costs use ${Math.round(budgetUsed * 100)}%` : ""}. Warns at {money.warnAt ?? 80}%.</p>
            ) : <p className="opx-muted" style={{ margin: 0 }}>No budget set. Leave it empty if there isn't one.</p>}
          </Section>
          {([["in", "Money you've put in", putIn, "putIn"], ["out", "Money brought in", brought, "broughtIn"]] as const).map(([kind, title, list, key]) => (
            <Section key={kind} title={title} count={list.length || undefined} action={<button className="opx-link" onClick={() => setForm({ kind, a: today, b: "", c: "" })}>＋ Log an amount</button>}>
              {list.length === 0 && form.kind !== kind && <p className="opx-muted" style={{ margin: 0 }}>{kind === "in" ? "Your own money, tools, contractors: anything that went into building it." : "Sales, retainers or payments this project has earned."}</p>}
              {[...list].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
                <div key={x.id} className="opx-li"><div><b>{fmt(x.amount)}</b><small>{fmtDate(x.date + "T12:00:00", { month: "short", day: "numeric", year: "numeric" })}{x.note ? ` · ${x.note}` : ""}</small></div>
                  <button className="opx-btn sm" disabled={busy} onClick={() => write({ [key]: list.filter((y) => y.id !== x.id) })} aria-label="Remove entry">Remove</button></div>
              ))}
              {form.kind === kind && (
                <form className="opx-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); const amount = num(form.b); if (amount != null) write({ [key]: [...list, { id: uid(), date: form.a || today, amount, note: form.c.trim() }] }) }}>
                  <input className="opx-input" type="date" style={{ width: 160 }} value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} aria-label="Date" />
                  <input className="opx-input" style={{ width: 120 }} placeholder="Amount" inputMode="decimal" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} aria-label="Amount" autoFocus />
                  <input className="opx-input" style={{ flex: 1, minWidth: 160 }} placeholder="Note" value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value })} aria-label="Note" />
                  <button className="opx-btn primary" disabled={busy}>Add</button><button type="button" className="opx-btn" onClick={() => setForm({ kind: null, a: "", b: "", c: "" })}>Cancel</button>
                </form>
              )}
            </Section>
          ))}
        </div>
      </div>
    </div>
  )
}

function InviteLink({ projectId }: { projectId: string }) {
  const [role, setRole] = useState<"viewer" | "editor">("viewer")
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const make = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "link", role, expiresInHours: 168, maxUses: 1 }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
      setUrl(j?.data?.inviteUrl || j?.inviteUrl || null)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the invite") }
    finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div className="opx-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>Invite someone</b>
        <div className="opx-seg" role="radiogroup" aria-label="Role">{(["viewer", "editor"] as const).map((k) => <button key={k} role="radio" aria-checked={role === k} className={role === k ? "on" : ""} onClick={() => setRole(k)}>{k === "viewer" ? "Can view" : "Can edit"}</button>)}</div>
        <button className="opx-btn" onClick={make} disabled={busy}>{busy ? "Creating…" : "Create invite link"}</button>
      </div>
      {url && (
        <div className="opx-row" style={{ gap: 8, marginTop: 10 }}>
          <input className="opx-input" readOnly value={url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
          <button className="opx-btn" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Copied"))}>Copy</button>
        </div>
      )}
      <small className="opx-muted" style={{ display: "block", marginTop: 6 }}>One person, valid for 7 days. Nothing is emailed: send the link yourself.</small>
    </div>
  )
}

// ─── Settings ───────────────────────────────────────────────────────────────

const SETTING_SECTIONS = [
  ["general", "General"], ["code", "Code & deploy"], ["people", "People"], ["docs", "Core documents"], ["views", "Views & defaults"], ["danger", "Archive & delete"],
] as const
type SettingKey = (typeof SETTING_SECTIONS)[number][0]

/** projects_status_check (migration 007): hyphenated values. */
export const STATUSES: [string, string][] = [["planning", "Planning"], ["in-progress", "In progress"], ["review", "Review"], ["on-hold", "On hold"], ["completed", "Done"]]
const ON_HOLD = "on-hold"
const PRIORITIES: [string, string][] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]]
const normStatus = (s: string) => s.replace(/_/g, "-")

export function SettingsTab({ projectId, project, onChange }: { projectId: string; project: any; onChange: () => void }) {
  const ui = uiOf(project)
  const [sec, setSec] = useState<SettingKey>("general")
  const [f, setF] = useState(() => ({
    name: project.name || "", description: project.description || "", status: normStatus(project.status || "planning"), priority: project.priority || "medium",
    due_date: (project.due_date || "").slice(0, 10), github_repo_url: project.github_repo_url || "", liveUrl: ui.liveUrl || "", stagingUrl: ui.stagingUrl || "",
    defaultTab: ui.defaultTab || "overview", defaultTaskView: ui.defaultTaskView || "board", decisionsView: ui.decisionsView || "pipeline",
    progressCountsSubtasks: !!ui.progressCountsSubtasks, coreDocs: ui.coreDocs || CORE_SLOTS.map((s) => s.name),
  }))
  const [newDoc, setNewDoc] = useState("")
  const [saving, setSaving] = useState(false)
  const team = useJson(sec === "people" ? `/api/projects/${projectId}/collaborators` : null)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  const save = async () => {
    if (!f.name.trim()) { toast.error("The project needs a name"); return }
    if (f.github_repo_url && !/^https?:\/\//.test(f.github_repo_url)) { toast.error("The repository should be a full link starting with https://"); return }
    setSaving(true)
    try {
      await saveProject(projectId, project,
        { name: f.name.trim(), description: f.description, status: f.status, priority: f.priority, due_date: f.due_date || null, ...(f.github_repo_url ? { github_repo_url: f.github_repo_url } : {}) },
        { liveUrl: f.liveUrl.trim(), stagingUrl: f.stagingUrl.trim(), defaultTab: f.defaultTab, defaultTaskView: f.defaultTaskView, decisionsView: f.decisionsView as PlannerUi["decisionsView"], progressCountsSubtasks: f.progressCountsSubtasks, coreDocs: f.coreDocs })
      toast.success("Saved"); onChange()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save") }
    finally { setSaving(false) }
  }
  const archive = async () => {
    if (!window.confirm(`Archive "${project.name}"? It's hidden from the dashboard and can be restored.`)) return
    try { await saveProject(projectId, project, { status: ON_HOLD }); toast.success("Moved to On hold"); onChange() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't archive") }
  }

  const fld = (label: string, id: string, ctl: React.ReactNode, hint?: string) => (
    <div className="opx-sf"><label htmlFor={id}>{label}</label><div>{ctl}{hint && <small>{hint}</small>}</div></div>
  )
  const pills = (id: string, opts: [string, string][], cur: string, on: (v: string) => void) => (
    <div className="opx-seg" id={id} role="radiogroup" aria-label={id}>{opts.map(([k, l]) => <button key={k} role="radio" aria-checked={k === cur} className={k === cur ? "on" : ""} onClick={() => on(k)}>{l}</button>)}</div>
  )
  const canSave = sec === "general" || sec === "code" || sec === "docs" || sec === "views"
  const collab = unwrap<any>(team.data) || {}

  return (
    <div className="opx-setw">
      <aside className="opx-sec">
        {SETTING_SECTIONS.map(([k, l]) => <button key={k} className={`opx-dc${k === sec ? " on" : ""}`} onClick={() => setSec(k)}>{l}</button>)}
      </aside>
      <section className="opx-sec">
        <div className="opx-sech"><h2 style={{ fontSize: 22 }}>{SETTING_SECTIONS.find(([k]) => k === sec)![1]}</h2></div>
        {sec === "general" && <>
          {fld("Name", "ps-name", <input id="ps-name" className="opx-input" value={f.name} onChange={(e) => set({ name: e.target.value })} />)}
          {fld("Description", "ps-desc", <textarea id="ps-desc" className="opx-input" rows={7} value={f.description} onChange={(e) => set({ description: e.target.value })} />)}
          {fld("Status", "status", pills("status", STATUSES.some(([k]) => k === f.status) ? STATUSES : [...STATUSES, [f.status, f.status]], f.status, (v) => set({ status: v })))}
          {fld("Priority", "priority", pills("priority", PRIORITIES, f.priority, (v) => set({ priority: v })))}
          {fld("Target date", "ps-due", <input id="ps-due" type="date" className="opx-input" style={{ maxWidth: 220 }} value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />, f.due_date ? undefined : "Not set. Leave it empty rather than guess.")}
          {fld("Tags", "tags", <div className="opx-row" style={{ gap: 6, flexWrap: "wrap" }}>{(project.tags || []).map((t: string) => <span key={t} className="opx-chip">{t}</span>)}{!(project.tags || []).length && <span className="opx-muted">None</span>}</div>, "Tags are set by agents for now.")}
        </>}
        {sec === "code" && <>
          {fld("Repository", "ps-repo", <input id="ps-repo" className="opx-input" placeholder="https://github.com/owner/repo" value={f.github_repo_url} onChange={(e) => set({ github_repo_url: e.target.value })} />, project.github_repo_url ? undefined : "Not linked yet.")}
          {fld("Workspace", "ps-ws", <input id="ps-ws" className="opx-input" readOnly value={project.workspace_path || "Not bound"} style={{ opacity: 0.7 }} />, "Set by agents when they bind a local folder to this project.")}
          {fld("Live site", "ps-live", <input id="ps-live" className="opx-input" placeholder="https://…" value={f.liveUrl} onChange={(e) => set({ liveUrl: e.target.value })} />)}
          {fld("Staging site", "ps-stage", <input id="ps-stage" className="opx-input" placeholder="https://…" value={f.stagingUrl} onChange={(e) => set({ stagingUrl: e.target.value })} />)}
        </>}
        {sec === "people" && <>
          {team.loading && !team.data ? <Loading what="people" /> : team.error ? <Failed what="people" error={team.error} retry={team.reload} /> : <>
            {collab.owner && <div className="opx-li"><span className="opx-av" style={{ backgroundImage: collab.owner.avatar_url ? `url("${collab.owner.avatar_url}")` : undefined }} /><div><b>{collab.owner.name}</b><small>Owner</small></div></div>}
            {(collab.collaborators || []).map((c: any) => <div key={c.id || c.email} className="opx-li"><span className="opx-av" /><div><b>{c.name || c.email}</b><small>{c.role || "Collaborator"}</small></div></div>)}
            {!(collab.collaborators || []).length && <p className="opx-muted">No collaborators yet.</p>}
            <InviteLink projectId={projectId} />
            {collab.pendingInvitationsCount ? <p className="opx-muted">{collab.pendingInvitationsCount} invitation(s) pending.</p> : null}
            <p className="opx-muted" style={{ fontSize: 12.5, marginTop: 16 }}>Agents connected with your key can read and update this project. Per-project agent limits aren't built yet.</p>
          </>}
        </>}
        {sec === "docs" && <>
          <p className="opx-muted" style={{ margin: "0 0 12px" }}>The documents this project should have. They show as slots at the top of Docs & files.</p>
          {[...new Set([...CORE_SLOTS.map((s) => s.name), ...f.coreDocs])].map((n) => (
            <div key={n} className="opx-tg"><span>{n}</span>
              <button className={`opx-sw${f.coreDocs.includes(n) ? " on" : ""}`} role="switch" aria-checked={f.coreDocs.includes(n)} aria-label={n} onClick={() => set({ coreDocs: f.coreDocs.includes(n) ? f.coreDocs.filter((x) => x !== n) : [...f.coreDocs, n] })} />
            </div>
          ))}
          <form className="opx-row" style={{ gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const n = newDoc.trim(); if (n && !f.coreDocs.includes(n)) set({ coreDocs: [...f.coreDocs, n] }); setNewDoc("") }}>
            <input className="opx-input" style={{ maxWidth: 280 }} placeholder="Add your own, e.g. Pricing model" value={newDoc} onChange={(e) => setNewDoc(e.target.value)} aria-label="New core document" />
            <button className="opx-btn">Add</button>
          </form>
        </>}
        {sec === "views" && <>
          {fld("Opens on", "open", pills("open", [["overview", "Overview"], ["tasks", "Tasks"], ["docs", "Docs & files"], ["decisions", "Ideas & decisions"]], f.defaultTab, (v) => set({ defaultTab: v })))}
          {fld("Task view", "taskview", pills("taskview", [["board", "Board"], ["list", "List"], ["timeline", "Timeline"], ["calendar", "Calendar"]], f.defaultTaskView, (v) => set({ defaultTaskView: v })))}
          {fld("Ideas & decisions", "decview", pills("decview", [["pipeline", "Pipeline"], ["timeline", "Timeline"]], f.decisionsView, (v) => set({ decisionsView: v as "pipeline" | "timeline" })))}
          {fld("Progress counts", "progress", pills("progress", [["top", "Top-level tasks only"], ["all", "Include subtasks"]], f.progressCountsSubtasks ? "all" : "top", (v) => set({ progressCountsSubtasks: v === "all" })), "Decides the % shown at the top of this project.")}
        </>}
        {sec === "danger" && <>
          <div className="opx-dz"><div><b>Move to On hold</b><small className="opx-muted">Takes it out of the active list. Everything is kept.</small></div><button className="opx-btn" onClick={archive}>On hold</button></div>
          <div className="opx-dz" style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--opx-hot) 35%, transparent)" }}><div><b>Delete this project</b><small className="opx-muted">Deleting is done from the Projects page, where it asks you to confirm by name.</small></div><a className="opx-btn danger" href="/projects">Go to Projects</a></div>
        </>}
        {canSave && (
          <div className="opx-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 18, borderTop: "1px solid var(--opx-line)", paddingTop: 14 }}>
            <button className="opx-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        )}
      </section>
      <aside className="opx-sec opx-sticky">
        <div className="opx-sech"><h2>At a glance</h2></div>
        {([
          ["Status", STATUSES.find(([k]) => k === normStatus(project.status || ""))?.[1] || project.status],
          ["Phase", project.current_phase_name || project.current_phase || "—"],
          ["Target date", project.due_date ? fmtDate(project.due_date, { month: "short", day: "numeric", year: "numeric" }) : "Not set"],
          ["Repository", project.github_repo_url ? "Linked" : "Not linked"],
          ["Workspace", project.workspace_path ? "Bound" : "Not bound"],
          ["Live site", ui.liveUrl ? "Set" : "Not set"],
          ["Created", ago(project.created_at)],
        ] as [string, string][]).map(([k, v]) => <div key={k} className="opx-tg"><span className="opx-muted">{k}</span><b style={{ fontWeight: 600 }}>{v}</b></div>)}
      </aside>
    </div>
  )
}
