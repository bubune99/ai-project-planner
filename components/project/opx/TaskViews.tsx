"use client"

/*
 * List, Timeline and Calendar views of a project's steps (owner 2026-11-13).
 * Board stays KanbanView. Views come in two pairs: [Board · List] and
 * [Timeline · Calendar]. Rules live in lib/project-views/schedule.ts.
 */

import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  DAY, addDays, byDay, dayKey, dayOf, dayTicks, dedupeTodos, monthCells, priorityRank, rangeOf, unscheduled,
  type PlannedRange, type Plannable,
} from "@/lib/project-views/schedule"
import { Failed, Loading, Priority, STATUS_COLOR, STATUS_LABEL, fmtDate, unwrap, useHoverTip, useJson } from "./shared"

export interface Step extends Plannable {
  description?: string | null
  progress?: number | null
  phase?: string | null
  is_subtask?: boolean | null
  parent_task_id?: string | null
  completed_at?: string | null
  created_at?: string | null
  tags?: string[] | null
}
interface Todo extends Plannable { status?: string | null; stepId?: string | null }
/** Cross-project fields, present when an item comes from /api/work. */
interface Owned { projectId?: string | null; projectName?: string | null; description?: string | null }

async function patchJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
  }
}

const topLevel = (s: Step[]) => s.filter((x) => !x.is_subtask && !x.parent_task_id)

// ─── List ───────────────────────────────────────────────────────────────────

export function TaskList({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useJson(`/api/projects/${projectId}/steps`)
  const { tipProps, node } = useHoverTip()
  const [busy, setBusy] = useState<string | null>(null)
  const steps = useMemo(() => topLevel(unwrap<Step[]>(data, "steps") || []), [data])
  const rows = useMemo(() => {
    const st: Record<string, number> = { "in-progress": 0, pending: 1, blocked: 1, completed: 2 }
    return [...steps].sort((a, b) => (st[a.status || ""] ?? 1) - (st[b.status || ""] ?? 1) || priorityRank(a.priority) - priorityRank(b.priority))
  }, [steps])
  if (loading && !data) return <Loading what="tasks" />
  if (error) return <Failed what="tasks" error={error} retry={reload} />
  const toggle = async (s: Step) => {
    setBusy(s.id)
    try { await patchJson(`/api/projects/${projectId}/steps/${s.id}`, { status: s.status === "completed" ? "pending" : "completed" }); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update the task") }
    finally { setBusy(null) }
  }
  const now = new Date()
  return (
    <section className="opx-sec" style={{ padding: "8px 0" }}>
      <div className="opx-lv opx-lvh"><span /><span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span>Progress</span></div>
      {rows.length === 0 && <div className="opx-empty" style={{ margin: 16 }}>No tasks yet.</div>}
      {rows.map((s) => {
        const r = rangeOf(s)
        const done = s.status === "completed"
        const late = r && r.end < now && !done
        return (
          <div key={s.id} className={`opx-lv${done ? " dn" : ""}`} {...tipProps(s.description)}>
            <button className={`opx-ck${done ? " on" : ""}`} aria-label={done ? `Reopen ${s.title}` : `Mark ${s.title} done`} disabled={busy === s.id} onClick={() => toggle(s)} />
            <b>{s.title}</b>
            <span className="opx-row" style={{ gap: 6, fontSize: 12.5 }}><i className="opx-dot" style={{ background: STATUS_COLOR[s.status || ""] || "#8a94a3", width: 7, height: 7 }} />{STATUS_LABEL[s.status || ""] || s.status}</span>
            <Priority p={s.priority} />
            <span style={{ fontSize: 13, color: late ? "var(--opx-hot)" : "var(--opx-muted)" }}>{r ? fmtDate(r.end) : "—"}</span>
            <span className="opx-pg"><i style={{ width: `${done ? 100 : s.progress || 0}%` }} /></span>
          </div>
        )
      })}
      {node}
    </section>
  )
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export function TaskTimeline({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useJson(`/api/projects/${projectId}/steps`)
  const { tipProps, node } = useHoverTip()
  const steps = useMemo(() => topLevel(unwrap<Step[]>(data, "steps") || []), [data])
  const dated = steps.map((s) => ({ s, r: rangeOf(s) })).filter((x) => x.r) as { s: Step; r: { start: Date; end: Date } }[]
  const undated = steps.filter((s) => !rangeOf(s) && s.status !== "completed")
  if (loading && !data) return <Loading what="the timeline" />
  if (error) return <Failed what="the timeline" error={error} retry={reload} />
  if (!dated.length) {
    return <div className="opx-empty">Nothing is scheduled yet. Use Plan mode on the Calendar to give tasks a start and due date. {undated.length} tasks are waiting.</div>
  }
  const min0 = new Date(Math.min(...dated.map((x) => +x.r.start)))
  const max0 = new Date(Math.max(...dated.map((x) => +x.r.end)))
  const min = new Date(min0.getFullYear(), min0.getMonth(), min0.getDate() - 3, 12)
  const max = new Date(max0.getFullYear(), max0.getMonth(), max0.getDate() + 4, 12)
  const total = +max - +min + DAY
  const pct = (d: Date) => ((+d - +min) / total) * 100
  const ticks = dayTicks(min, max)
  const today = dayOf(new Date())!
  const groups = new Map<string, typeof dated>()
  for (const x of dated.sort((a, b) => +a.r.start - +b.r.start)) {
    const g = x.s.phase && !/^\d+$/.test(x.s.phase) ? x.s.phase : "Tasks"
    groups.set(g, [...(groups.get(g) || []), x])
  }
  const grid = ticks.map((t) => <i key={dayKey(t.date)} className={`opx-gl${t.week ? " wk" : ""}`} style={{ left: `${pct(t.date)}%` }} />)
  return (
    <section className="opx-sec" style={{ padding: 0, overflow: "hidden" }}>
      <div className="opx-tlrow opx-tlhead">
        <div className="opx-tln opx-muted" style={{ fontSize: 12.5 }}>{dated.length} scheduled · {fmtDate(min0, { month: "short", year: "numeric" })} to {fmtDate(max0, { month: "short", year: "numeric" })}</div>
        <div className="opx-tlt">
          {ticks.filter((t) => t.week).map((t) => <span key={dayKey(t.date)} className="opx-wk" style={{ left: `${pct(t.date)}%` }}>{fmtDate(t.date)}</span>)}
          {today >= min && today <= max && <i className="opx-tod" style={{ left: `${pct(today)}%` }} />}
        </div>
      </div>
      {[...groups.entries()].map(([g, rows]) => (
        <div key={g}>
          <div className="opx-tlg">{g.charAt(0).toUpperCase() + g.slice(1)} <span className="opx-n">{rows.length}</span></div>
          {rows.map(({ s, r }) => (
            <div key={s.id} className="opx-tlrow">
              <div className="opx-tln" title={s.title}><i className="opx-dot" style={{ background: STATUS_COLOR[s.status || ""] || "#8a94a3" }} />{s.title}</div>
              <div className="opx-tlt">
                {grid}
                {today >= min && today <= max && <i className="opx-tod" style={{ left: `${pct(today)}%` }} />}
                <div
                  className="opx-gbar"
                  {...tipProps(`${s.title}\n${fmtDate(r.start)} → ${fmtDate(r.end)}${s.description ? `\n\n${s.description}` : ""}`)}
                  style={{ left: `${pct(r.start)}%`, width: `max(10px, ${((+r.end - +r.start + DAY) / total) * 100}%)`, background: STATUS_COLOR[s.status || ""] || "#8a94a3" }}
                >
                  {+r.end - +r.start >= 4 * DAY ? `${fmtDate(r.start)} – ${fmtDate(r.end)}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {undated.length > 0 && <div className="opx-tlg opx-muted" style={{ fontWeight: 400 }}>{undated.length} tasks have no dates and aren't drawn. Schedule them from the Calendar's Plan mode.</div>}
      {node}
    </section>
  )
}

// ─── Calendar with day panel and plan mode ──────────────────────────────────

type Item = { item: Step | Todo; kind: "step" | "todo" }

export function TaskCalendar({ projectId }: { projectId: string }) {
  const stepsQ = useJson(`/api/projects/${projectId}/steps`)
  const todosQ = useJson(`/api/todos?projectId=${projectId}&limit=100`)
  const steps = useMemo(() => topLevel(unwrap<Step[]>(stepsQ.data, "steps") || []), [stepsQ.data])
  const todos = useMemo(() => dedupeTodos(unwrap<Todo[]>(todosQ.data) || [], steps.map((s) => s.title)), [todosQ.data, steps])
  const items: Item[] = useMemo(() => [...steps.map((item) => ({ item, kind: "step" as const })), ...todos.map((item) => ({ item, kind: "todo" as const }))], [steps, todos])
  return (
    <PlanCalendar
      items={items}
      loading={(stepsQ.loading && !stepsQ.data) || (todosQ.loading && !todosQ.data)}
      error={stepsQ.error}
      reload={() => { stepsQ.reload(); todosQ.reload() }}
      markDone={(e, next) => e.kind === "step"
        ? patchJson(`/api/projects/${projectId}/steps/${e.item.id}`, { status: next ? "completed" : "pending" })
        : patchJson(`/api/todos/${e.item.id}`, { status: next ? "completed" : "pending" })}
      saveRange={(e, p) => e.kind === "todo"
        ? patchJson(`/api/todos/${e.item.id}`, { dueDate: p.due || p.start })
        : patchJson(`/api/projects/${projectId}/steps/${e.item.id}`, { start_date: p.start, end_date: p.due || p.start })}
      groupOf={(e) => {
        const ph = e.kind === "step" ? (e.item as Step).phase : null
        return e.kind === "todo" ? "Todos" : ph && !/^\d+$/.test(ph) ? ph.charAt(0).toUpperCase() + ph.slice(1) : "Tasks"
      }}
    />
  )
}

/** A read-only entry from the shared calendar: an event, milestone or bill. */
export interface CalExtra { id: string; title: string; day: string; type: string; color?: string | null }

interface PlanCalendarProps {
  items: Item[]
  loading: boolean
  error: string | null
  reload: () => void
  markDone: (e: Item, done: boolean) => Promise<void>
  saveRange: (e: Item, p: PlannedRange) => Promise<void>
  groupOf: (e: Item) => string
  extras?: CalExtra[]
  toolbar?: ReactNode
}

const EXTRA_LABEL: Record<string, string> = { event: "Events", milestone: "Milestones", bill: "Bills" }

/** The calendar itself: month grid, day panel, Plan mode. Data and writes come from the wrapper. */
export function PlanCalendar({ items, loading, error, reload, markDone, saveRange, groupOf, extras = [], toolbar }: PlanCalendarProps) {
  const now = dayOf(new Date())!
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12))
  const [sel, setSel] = useState<Date>(now)
  const [tab, setTab] = useState<"all" | "left" | "done">("all")
  const [plan, setPlan] = useState(false)
  const [planned, setPlanned] = useState<Record<string, PlannedRange>>({})
  const [bk, setBk] = useState<"all" | "step" | "todo">("all")
  const [dropDay, setDropDay] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<Record<string, boolean>>({})

  const days = useMemo(() => byDay(items, planned), [items, planned])
  const backlog = useMemo(() => unscheduled(items, planned), [items, planned])
  const cells = monthCells(month.getFullYear(), month.getMonth())

  const extrasByDay = useMemo(() => {
    const m = new Map<string, CalExtra[]>()
    for (const x of extras) m.set(x.day, [...(m.get(x.day) || []), x])
    return m
  }, [extras])

  if (loading) return <Loading what="the calendar" />
  if (error) return <Failed what="the calendar" error={error} retry={reload} />

  const isDone = (e: Item) => done[e.item.id] ?? e.item.status === "completed"
  const dayList = (days.get(dayKey(sel)) || []).map((e) => ({ item: e.item, kind: e.kind }))
  const left = dayList.filter((e) => !isDone(e)), finished = dayList.filter(isDone)
  const shown = tab === "left" ? left : tab === "done" ? finished : dayList
  const groups = new Map<string, Item[]>()
  for (const e of shown) {
    const g = groupOf(e)
    groups.set(g, [...(groups.get(g) || []), e])
  }
  const dayExtras = extrasByDay.get(dayKey(sel)) || []
  const inMonth = new Set<string>()
  for (const [k, list] of days) if (k.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`)) list.forEach((e) => inMonth.add(e.item.id))
  const isToday = dayKey(sel) === dayKey(now)
  const nPlanned = Object.keys(planned).length

  const check = async (e: Item) => {
    const next = !isDone(e)
    setDone((d) => ({ ...d, [e.item.id]: next }))
    try {
      await markDone(e, next)
    } catch (err) {
      setDone((d) => ({ ...d, [e.item.id]: !next }))
      toast.error(err instanceof Error ? err.message : "Couldn't update it")
    }
  }

  /*
   * Saving writes start and due to steps. Todos only have a due date, so a
   * todo gets its due date (or its start, when no due was picked).
   */
  const save = async () => {
    setSaving(true)
    const byId = new Map(items.map((e) => [e.item.id, e]))
    const failed: string[] = []
    for (const [id, p] of Object.entries(planned)) {
      const e = byId.get(id)
      try { if (!e) throw new Error("gone"); await saveRange(e, p) } catch { failed.push(id) }
    }
    setSaving(false)
    if (failed.length) toast.error(`${failed.length} of ${nPlanned} couldn't be saved; they're still planned here.`)
    else toast.success(`Saved ${nPlanned} schedule${nPlanned > 1 ? "s" : ""}`)
    setPlanned((p) => Object.fromEntries(Object.entries(p).filter(([id]) => failed.includes(id))))
    reload()
  }

  const onDrop = (d: Date, id: string) => {
    if (!id) return
    setPlanned((p) => ({ ...p, [id]: { start: dayKey(d), due: p[id]?.due && p[id].due >= dayKey(d) ? p[id].due : "" } }))
    setSel(d)
  }
  const blist = backlog.filter((e) => bk === "all" || e.kind === bk)

  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-row">
        <button className={`opx-btn${plan ? " on" : ""}`} onClick={() => setPlan((v) => !v)} aria-pressed={plan}>{plan ? "Done planning" : "Plan mode"}</button>
        {plan && <span className="opx-muted" style={{ fontSize: 13 }}>Drag a task onto a day to set its start, then pick its due date in the day panel.</span>}
        {toolbar && <span className="opx-row" style={{ marginLeft: "auto", gap: 8 }}>{toolbar}</span>}
      </div>
      {nPlanned > 0 && (
        <div className="opx-savebar">
          <b>{nPlanned} planned</b>
          <span className="opx-muted">Not saved yet. Start and due dates are written when you save.</span>
          <button className="opx-btn" style={{ marginLeft: "auto" }} onClick={() => setPlanned({})} disabled={saving}>Discard</button>
          <button className="opx-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : `Save ${nPlanned} schedule${nPlanned > 1 ? "s" : ""}`}</button>
        </div>
      )}
      <div className={`opx-calwrap${plan ? " plan" : ""}`}>
        {plan && (
          <aside className="opx-sec opx-sticky" style={{ display: "flex", flexDirection: "column", padding: 18 }}>
            <div className="opx-sech"><h2>To schedule</h2><span className="opx-n">{backlog.length}</span></div>
            <div className="opx-seg" style={{ marginBottom: 10, alignSelf: "flex-start" }}>
              {(["all", "step", "todo"] as const).map((k) => (
                <button key={k} className={bk === k ? "on" : ""} onClick={() => setBk(k)}>
                  {k === "all" ? "All" : k === "step" ? "Tasks" : "Todos"} {k === "all" ? backlog.length : backlog.filter((e) => e.kind === k).length}
                </button>
              ))}
            </div>
            <div className="opx-blist">
              {blist.length === 0 && <p className="opx-muted" style={{ fontSize: 13 }}>Everything here has a date.</p>}
              {blist.slice(0, 80).map((e) => (
                <div key={e.item.id} className="opx-bi" draggable onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.item.id)}>
                  <b>{e.item.title}</b>
                  <div className="opx-row" style={{ gap: 8, marginTop: 5, fontSize: 12.5, color: "var(--opx-muted)" }}><Priority p={e.item.priority} /><span>{e.kind === "todo" ? "Todo" : "Task"}</span>{(e.item as Owned).projectName && <span>· {(e.item as Owned).projectName}</span>}</div>
                </div>
              ))}
            </div>
          </aside>
        )}
        <section className="opx-sec">
          <div className="opx-sech">
            <h2>{fmtDate(month, { month: "long", year: "numeric" })}</h2>
            <span className="opx-n">{inMonth.size} this month</span>
            <span className="opx-row" style={{ marginLeft: "auto", gap: 6 }}>
              <button className="opx-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>‹</button>
              <button className="opx-btn" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSel(now) }}>Today</button>
              <button className="opx-btn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>›</button>
            </span>
          </div>
          <div className="opx-cg">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="opx-cd opx-muted">{d}</div>)}
            {cells.map((d) => {
              const k = dayKey(d)
              const list = days.get(k) || []
              const ex = extrasByDay.get(k) || []
              const total = list.length + ex.length
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  aria-label={`${fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}, ${total} on this day`}
                  className={`opx-cc${d.getMonth() !== month.getMonth() ? " out" : ""}${k === dayKey(now) ? " today" : ""}${k === dayKey(sel) ? " sel" : ""}${dropDay === k ? " drop" : ""}`}
                  onClick={() => setSel(d)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(d) } }}
                  onDragOver={(e) => { e.preventDefault(); setDropDay(k) }}
                  onDragLeave={() => setDropDay(null)}
                  onDrop={(e) => { e.preventDefault(); setDropDay(null); onDrop(d, e.dataTransfer.getData("text/plain")) }}
                >
                  <span className="opx-cn">{d.getDate()}</span>
                  {list.slice(0, 3).map((e) => (
                    <div key={e.item.id} title={e.item.title}
                      className={`opx-ce${e.planned ? " pl" : ""}${e.first ? "" : " cont"}${e.last ? " end" : ""}`}
                      style={{ ["--c" as string]: e.kind === "todo" ? "var(--opx-violet)" : STATUS_COLOR[e.item.status || ""] || "#8a94a3" }}>
                      {e.first ? e.item.title : " "}
                    </div>
                  ))}
                  {ex.slice(0, Math.max(0, 3 - list.length)).map((x) => (
                    <div key={x.id} title={x.title} className="opx-ce ev" style={{ ["--c" as string]: x.color || "var(--opx-accent)" }}>{x.title}</div>
                  ))}
                  {total > 3 && <div className="opx-muted" style={{ fontSize: 11.5 }}>+{total - 3} more</div>}
                </div>
              )
            })}
          </div>
        </section>
        <aside className="opx-sec opx-sticky opx-dp">
          <div className="opx-muted" style={{ fontSize: 11.5 }}>{fmtDate(sel, { month: "long", year: "numeric" }).toUpperCase()}{isToday ? " · TODAY" : ""}</div>
          <div className="opx-row" style={{ alignItems: "baseline" }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{isToday ? "Today" : fmtDate(sel, { weekday: "long" })}</h2>
            <span style={{ marginLeft: "auto", textAlign: "right", color: "var(--opx-muted)", fontSize: 14 }}>
              <b style={{ fontSize: 26, color: "var(--opx-ink)" }}>{finished.length}</b>/{dayList.length}
              <small style={{ display: "block", fontSize: 12 }}>{left.length} left</small>
            </span>
          </div>
          <div className="opx-muted" style={{ fontSize: 13 }}>{fmtDate(sel, { weekday: "long", month: "long", day: "numeric" })} · {dayList.length ? `${dayList.length} thing${dayList.length > 1 ? "s" : ""} on this day` : "nothing on this day"}</div>
          <div className="opx-segbar">{dayList.length ? dayList.map((e) => <i key={e.item.id} className={isDone(e) ? "on" : ""} />) : <i />}</div>
          <div className="opx-row" style={{ gap: 4, flexWrap: "wrap" }}>
            {(["all", "left", "done"] as const).map((k) => (
              <button key={k} className={`opx-pt${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
                {k === "all" ? "All" : k === "left" ? "Left" : "Done"} {k === "all" ? dayList.length : k === "left" ? left.length : finished.length}
              </button>
            ))}
          </div>
          {[...groups.entries()].map(([g, list]) => (
            <div key={g} className="opx-dpg">
              <div className="opx-row" style={{ marginBottom: 4 }}>
                <b>{g}</b><span className="opx-muted">{list.filter(isDone).length}/{list.length}</span>
                <button className="opx-btn sm" style={{ marginLeft: "auto" }} onClick={() => list.filter((e) => !isDone(e)).forEach(check)}>✓ Check all</button>
              </div>
              {list.map((e) => {
                const p = planned[e.item.id]
                const r = rangeOf(e.item, p)
                return (
                  <div key={e.item.id} className={`opx-dpi${isDone(e) ? " dn" : ""}`}>
                    <button className={`opx-ck${isDone(e) ? " on" : ""}`} aria-label={isDone(e) ? `Reopen ${e.item.title}` : `Check off ${e.item.title}`} onClick={() => check(e)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{e.item.title}</b>
                      <small>{e.kind === "todo" ? "Todo" : STATUS_LABEL[e.item.status || ""] || ""}{r ? ` · ${fmtDate(r.start)}${+r.end !== +r.start ? ` → ${fmtDate(r.end)}` : ""}` : ""}{p ? " · planned, not saved" : ""}</small>
                      {p && (
                        <div className="opx-row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          <label className="opx-dl">Start <input type="date" value={p.start} onChange={(ev) => ev.target.value && setPlanned((x) => ({ ...x, [e.item.id]: { start: ev.target.value, due: x[e.item.id].due && x[e.item.id].due < ev.target.value ? ev.target.value : x[e.item.id].due } }))} /></label>
                          <label className="opx-dl">Due <input type="date" value={p.due} min={p.start} onChange={(ev) => setPlanned((x) => ({ ...x, [e.item.id]: { ...x[e.item.id], due: ev.target.value && ev.target.value < x[e.item.id].start ? x[e.item.id].start : ev.target.value } }))} /></label>
                          <span className="opx-row" style={{ gap: 4 }}>
                            {([["+1d", 1], ["+3d", 3], ["+1w", 7], ["+2w", 14]] as const).map(([l, n]) => (
                              <button key={l} className="opx-pt" onClick={() => setPlanned((x) => ({ ...x, [e.item.id]: { ...x[e.item.id], due: addDays(x[e.item.id].start, n) } }))}>{l}</button>
                            ))}
                          </span>
                          <button className="opx-pt" onClick={() => setPlanned((x) => { const { [e.item.id]: _, ...rest } = x; return rest })}>Unplan</button>
                        </div>
                      )}
                    </div>
                    <Priority p={e.item.priority} />
                  </div>
                )
              })}
            </div>
          ))}
          {dayExtras.length > 0 && (
            <div className="opx-dpg">
              <div className="opx-row" style={{ marginBottom: 4 }}><b>On the calendar</b><span className="opx-muted">{dayExtras.length}</span></div>
              {dayExtras.map((x) => (
                <div key={x.id} className="opx-dpi">
                  <i className="opx-dot" style={{ background: x.color || "var(--opx-accent)", marginTop: 6 }} />
                  <div style={{ flex: 1, minWidth: 0 }}><b>{x.title}</b><small>{EXTRA_LABEL[x.type]?.replace(/s$/, "") || x.type}</small></div>
                </div>
              ))}
            </div>
          )}
          {!groups.size && !dayExtras.length && <div className="opx-empty">Nothing on this day.{plan ? " Drag something here from the list." : " Turn on Plan mode to schedule work here."}</div>}
        </aside>
      </div>
    </div>
  )
}
