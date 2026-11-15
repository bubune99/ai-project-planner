"use client"

/*
 * The project page's List and Calendar, across every project (owner
 * 2026-11-13: "the calendar and list options in the project should be
 * reflected in the macro tabs for to do and calendar").
 *
 * Data is GET /api/work: each project task once, plus the todos that are not
 * copies of a task (see lib/work-items.ts). Writes go through the same routes
 * the project page uses, so completing or scheduling something here is the
 * same as doing it on the project.
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { NO_FILTER, bulkPlan, compareWork, filterCounts, isFiltered, matchesQuery, passesColumns, staleDays, type BulkAction, type BulkStep, type WorkColumns, type WorkItem } from "@/lib/work-items"
import { dayOf, dayKey, type PlannedRange } from "@/lib/project-views/schedule"
import { PlanCalendar, type CalExtra } from "@/components/project/opx/TaskViews"
import { Failed, Loading, Priority, Seg, fmtDate, unwrap, useHoverTip, useJson } from "@/components/project/opx/shared"

type StatusKeys = Record<string, { done: string; open: string }>
interface WorkData { items: WorkItem[]; statusKeys: StatusKeys }

async function patchJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
  }
}

/** Complete or reopen a work item with its own project's status keys (a project may call "done" something else). */
function setWorkDone(w: { kind: "step" | "todo"; id: string; projectId?: string | null }, done: boolean, keys: StatusKeys) {
  if (w.kind === "todo") return patchJson(`/api/todos/${w.id}`, { status: done ? "completed" : "pending" })
  const k = keys[w.projectId ?? ""] ?? { done: "completed", open: "pending" }
  return patchJson(`/api/projects/${w.projectId}/steps/${w.id}`, { status: done ? k.done : k.open })
}

/** Priority is a dot beside plain text, as on every other screen: colored words at this size read at 3.4 to 1. */
const PRI_DOT: Record<string, string> = { urgent: "var(--opx-hot)", high: "#e0913a", medium: "#8a94a3", low: "#5b6470" }
const KIND_LABEL: Record<string, string> = { open: "To do", active: "In progress", done: "Done", closed: "Closed" }
const KIND_COLOR: Record<string, string> = { open: "#8a94a3", active: "var(--opx-accent)", done: "var(--opx-good)", closed: "#8a94a3" }

// ─── List ───────────────────────────────────────────────────────────────────

export function WorkList({ refreshKey = 0, onEditTodo }: { refreshKey?: number; onEditTodo?: (id: string) => void }) {
  const [view, setView] = useState<"open" | "done">("open")
  const { data, loading, error, reload } = useJson(`/api/work?view=${view}&r=${refreshKey}`)
  const { tipProps, node } = useHoverTip()
  const [flip, setFlip] = useState<Record<string, boolean>>({})
  /**
   * Status, priority and due date are changed on the row itself (owner, 2026-11-15: "todos route lacks a method to
   * edit a due date or priority and even a status from that window. Should it have that?"). What was changed is shown
   * at once and put back, with a line saying so, if the save fails.
   */
  const [edits, setEdits] = useState<Record<string, Partial<Pick<WorkItem, "statusKind" | "priority" | "dueDate">>>>({})
  const change = async (w: WorkItem, patch: Partial<Pick<WorkItem, "statusKind" | "priority" | "dueDate">>, quiet = false) => {
    const before = edits[w.id]
    setEdits((e) => ({ ...e, [w.id]: { ...e[w.id], ...patch } }))
    try {
      const keys = (work?.statusKeys || {})[w.projectId ?? ""] ?? { done: "completed", open: "pending" }
      const body: Record<string, unknown> = {}
      if (patch.statusKind) body.status = w.kind === "todo"
        ? ({ open: "pending", active: "in_progress", done: "completed" } as Record<string, string>)[patch.statusKind]
        : ({ open: keys.open, active: "in-progress", done: keys.done } as Record<string, string>)[patch.statusKind]
      if ("priority" in patch) body.priority = patch.priority
      if ("dueDate" in patch) body[w.kind === "todo" ? "dueDate" : "end_date"] = patch.dueDate
      await patchJson(w.kind === "todo" ? `/api/todos/${w.id}` : `/api/projects/${w.projectId}/steps/${w.id}`, body)
      if (patch.statusKind) setFlip((f) => { const { [w.id]: _, ...rest } = f; return rest })
      return true
    } catch (e) {
      setEdits((x) => ({ ...x, [w.id]: before ?? {} }))
      if (!quiet) toast.error(e instanceof Error ? `Not saved: ${e.message}` : "Not saved")
      return false
    }
  }

  /**
   * Several rows at once. Owner, 2026-11-15, asked whether rows should be selectable so several can be changed
   * together: "Yes: mark done, set priority, set due date, delete (todos only), with Undo".
   */
  const [picking, setPicking] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  /**
   * The bar is pinned to the bottom of the screen, over the list, so it is in reach however long the list is (owner,
   * 2026-11-15: "If I have to scroll all the way down to do that and there are hundreds of items, that is no good for
   * me. It should be sticky towards the bottom of the page"). The page scrolls, not the list, so the bar is measured
   * against the list's own column rather than left to "sticky".
   */
  const colRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!picking) return
    const el = colRef.current
    if (!el) return
    const measure = () => { const r = el.getBoundingClientRect(); setRoom({ left: r.left, width: r.width }) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el); ro.observe(document.documentElement)
    window.addEventListener("resize", measure)
    return () => { ro.disconnect(); window.removeEventListener("resize", measure) }
  }, [picking])
  const pick = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); for (const id of ids) on ? n.add(id) : n.delete(id); return n })
  const stopPicking = () => { setPicking(false); setSel(new Set()) }
  /** Carry out steps, six at a time. Returns how many did not go through. */
  const carry = async (steps: BulkStep[], which: "patch" | "undo") => {
    const byId = new Map((work?.items || []).map((x) => [x.id, x] as const))
    let failed = 0
    for (let i = 0; i < steps.length; i += 6) {
      const got = await Promise.all(steps.slice(i, i + 6).map(async (s) => {
        const w = byId.get(s.id), what = s[which]
        if (!w) return false
        if (what === "delete") return fetch(`/api/todos/${s.id}`, { method: "DELETE" }).then((r) => r.ok, () => false)
        if (what === "restore") return patchJson(`/api/todos/${s.id}`, { restore: true }).then(() => true, () => false)
        return change(w, what, true)
      }))
      failed += got.filter((ok) => !ok).length
    }
    return failed
  }
  const runBulk = async (action: BulkAction, said: string) => {
    const now = (work?.items || []).map((x) => ({ ...x, ...edits[x.id] }))
    const { steps, skipped } = bulkPlan(now, sel, action)
    if (!steps.length) { toast(action.do === "delete" ? "Only todos can be deleted here. No todos are selected." : "Nothing to change: the selected rows are already like that."); return }
    setBusy(true)
    const failed = await carry(steps, "patch")
    setBusy(false)
    if (action.do === "delete" || action.do === "done") { setSel(new Set()); reload() }
    const n = steps.length - failed
    const line = `${said}: ${n} row${n === 1 ? "" : "s"}${skipped ? `, ${skipped} left as ${action.do === "delete" ? "they are (tasks are not deleted here)" : "they were"}` : ""}${failed ? `, ${failed} not saved` : ""}`
    toast(line, { duration: 12000, action: { label: "Undo", onClick: async () => {
      const back = await carry(steps, "undo")
      reload()
      if (back) toast.error(`${back} could not be put back`); else toast("Put back")
    } } })
  }
  const work = unwrap<WorkData>(data)
  /**
   * Narrowing a long list: words to look for, and one dropdown per column (owner, 2026-11-15: "Major rule, chip
   * filters when we can have drop downs in relation to a column. I will choose the column every time.").
   */
  const [q, setQ] = useState("")
  const [cols, setCols] = useState<WorkColumns>(NO_FILTER)
  const counts = useMemo(() => filterCounts(work?.items || [], new Date()), [work])
  const shown = useMemo(() => { const now = new Date(); return (work?.items || []).filter((x) => passesColumns(x, cols, now) && matchesQuery(x, q.trim())) }, [work, cols, q])
  const only = cols.status
  const groups = useMemo(() => {
    const now = new Date()
    const sorted = [...shown].sort((a, b) => compareWork(a, b, now))
    const m = new Map<string, WorkItem[]>()
    for (const w of sorted) { const g = w.projectName || "Personal"; m.set(g, [...(m.get(g) || []), w]) }
    return [...m.entries()].sort((a, b) => (a[0] === "Personal" ? 1 : b[0] === "Personal" ? -1 : b[1].length - a[1].length))
  }, [shown])

  const isDone = (w: WorkItem) => flip[w.id] ?? (edits[w.id]?.statusKind ?? w.statusKind) === "done"
  const toggle = async (w: WorkItem) => {
    const next = !isDone(w)
    setFlip((f) => ({ ...f, [w.id]: next }))
    try { await setWorkDone(w, next, work?.statusKeys || {}) }
    catch (e) { setFlip((f) => ({ ...f, [w.id]: !next })); toast.error(e instanceof Error ? e.message : "Couldn't update it") }
  }

  const all = work?.items.length ?? 0, total = shown.length, narrowed = isFiltered(cols) || !!q.trim()
  const today = dayOf(new Date())!
  return (
    <div ref={colRef} className="opx-col" style={{ gap: 12, paddingBottom: picking ? 120 : undefined }}>
      <div className="opx-row">
        <Seg label="Show" value={view} onChange={(v) => { setView(v); setFlip({}) }} options={[["open", "Open"], ["done", "Done"]]} />
        <span className="opx-muted" style={{ fontSize: 13 }}>{loading && !data ? "Loading…" : `${narrowed ? `${total} of ${all}` : total} ${view === "open" ? "open" : "done"} across ${groups.length} group${groups.length === 1 ? "" : "s"}`}</span>
        {total > 0 && <button type="button" className="opx-btn" style={{ marginLeft: "auto" }} aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))}>{picking ? "Stop selecting" : "Select several"}</button>}
      </div>
      {loading && !data && <Loading what="your work" />}
      {error && <Failed what="your work" error={error} retry={reload} />}
      <div className="opx-lv opx-lvp opx-wf" role="group" aria-label="Narrow the list">
        <span />
        <input className="opx-input" placeholder="Find by words or project" aria-label="Find in my work" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`opx-input${cols.status !== "any" ? " on" : ""}`} aria-label="Filter by status" value={cols.status} onChange={(e) => setCols({ ...cols, status: e.target.value as WorkColumns["status"] })}>
          <option value="any">Status: any</option><option value="open">To do</option><option value="active">In progress</option><option value="stale">Not touched in 90 days ({counts.stale})</option>
        </select>
        <select className={`opx-input${cols.priority !== "any" ? " on" : ""}`} aria-label="Filter by priority" value={cols.priority} onChange={(e) => setCols({ ...cols, priority: e.target.value as WorkColumns["priority"] })}>
          <option value="any">Priority: any</option><option value="hot">Urgent and high ({counts.hot})</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Normal</option><option value="low">Low</option><option value="none">None set</option>
        </select>
        <select className={`opx-input${cols.due !== "any" ? " on" : ""}`} aria-label="Filter by due date" value={cols.due} onChange={(e) => setCols({ ...cols, due: e.target.value as WorkColumns["due"] })}>
          <option value="any">Due: any</option><option value="overdue">Overdue ({counts.overdue})</option><option value="week">This week ({counts.week})</option><option value="nodate">No date ({counts.nodate})</option>
        </select>
        <select className={`opx-input${cols.kind !== "any" ? " on" : ""}`} aria-label="Filter by type" value={cols.kind} onChange={(e) => setCols({ ...cols, kind: e.target.value as WorkColumns["kind"] })}>
          <option value="any">Type: any</option><option value="todo">Todos ({counts.todo})</option><option value="step">Tasks ({counts.step})</option>
        </select>
      </div>
      {narrowed && <div className="opx-row"><button type="button" className="opx-link opx-act" onClick={() => { setQ(""); setCols(NO_FILTER) }}>Show everything</button></div>}
      {only === "stale" && total > 0 && <p className="opx-muted" style={{ margin: 0, fontSize: 13 }}>Open and not changed for 90 days or more. Each row says how long. Nothing here is closed for you.</p>}
      {!loading && !error && total === 0 && <div className="opx-empty">{narrowed ? "Nothing matches. Press Show everything to see the whole list." : view === "open" ? "Nothing open. Add something above." : "Nothing finished yet."}</div>}
      {groups.map(([g, list]) => (
        <section key={g} className="opx-sec" style={{ padding: "8px 0" }}>
          <div className="opx-sech" style={{ padding: "10px 18px 6px" }}>
            <h2 style={{ fontSize: 16 }}>{g}</h2><span className="opx-n">{list.length}</span>
            {picking && (() => { const ids = list.map((x) => x.id), allIn = ids.every((id) => sel.has(id)); return <button type="button" className="opx-link opx-act" aria-label={`${allIn ? "Clear" : "Select"} all ${list.length} in ${g}`} onClick={() => pick(ids, !allIn)}>{allIn ? "Clear these" : `Select all ${list.length}`}</button> })()}
            {list[0]?.projectId && <a className="opx-link opx-act" style={{ marginLeft: "auto" }} aria-label={`Open the project ${g}`} href={`/project/${list[0].projectId}?tab=tasks&view=list`}>Open project ›</a>}
          </div>
          <div className="opx-lv opx-lvp opx-lvh"><span /><span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span>Type</span></div>
          {list.map((w0) => {
            const w = { ...w0, ...edits[w0.id] }
            const done = isDone(w)
            const due = dayOf(w.dueDate)
            const late = due && due < today && !done
            return (
              <div key={w.id} className={`opx-lv opx-lvp${done ? " dn" : ""}`} {...tipProps(w.description)}>
                {picking
                  ? <label className="opx-pick"><input type="checkbox" aria-label={`Select ${w.title}`} checked={sel.has(w.id)} onChange={(e) => pick([w.id], e.target.checked)} /></label>
                  : <button className={`opx-ck${done ? " on" : ""}`} aria-label={done ? `Reopen ${w.title}` : `Mark ${w.title} done`} onClick={() => toggle(w)} />}
                {w.kind === "todo" && onEditTodo
                  ? <button className="opx-link opx-act" style={{ justifyContent: "flex-start", textAlign: "left", fontWeight: 600, fontSize: 14.5, color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => onEditTodo(w.id)}>{w.title}</button>
                  : <b>{w.title}</b>}
                <span className="opx-row" style={{ gap: 6, fontSize: 12.5, minWidth: 0 }}><i className="opx-dot" style={{ background: KIND_COLOR[w.statusKind], width: 7, height: 7, flex: "none" }} />
                  <select className="opx-rowsel" aria-label={`Status of ${w.title}`} value={done ? "done" : w.statusKind} onChange={(e) => change(w0, { statusKind: e.target.value as WorkItem["statusKind"] })}>
                    <option value="open">{KIND_LABEL.open}</option><option value="active">{KIND_LABEL.active}</option><option value="done">{KIND_LABEL.done}</option>
                    {w.statusKind === "closed" && <option value="closed" disabled>{KIND_LABEL.closed}</option>}
                  </select>
                </span>
                <span className="opx-row" style={{ gap: 6, minWidth: 0 }}>{w.priority && <i className="opx-dot" style={{ background: PRI_DOT[w.priority] || "#8a94a3", width: 7, height: 7, flex: "none" }} />}<select className="opx-rowsel" aria-label={`Priority of ${w.title}`} value={w.priority ?? ""} onChange={(e) => change(w0, { priority: (e.target.value || null) as WorkItem["priority"] })}>
                  {!w.priority && <option value="">No priority</option>}
                  <option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Normal</option><option value="low">Low</option>
                </select></span>
                <input type="date" className={`opx-rowsel${late ? " hot" : ""}`} aria-label={`Due date of ${w.title}`} value={due ? dayKey(due) : ""}
                  onChange={(e) => change(w0, { dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })} />
                <span className="opx-muted" style={{ fontSize: 12.5 }}>{only === "stale" ? `${staleDays(w0)} days untouched` : w.kind === "todo" ? "Todo" : "Task"}</span>
              </div>
            )
          })}
        </section>
      ))}
      {picking && (() => {
        const chosen = (work?.items || []).filter((x) => sel.has(x.id)), todos = chosen.filter((x) => x.kind === "todo").length, none = chosen.length === 0 || busy
        return (
          <div className="opx-bulk" role="region" aria-label="Change the selected rows" style={room ? { left: room.left, width: room.width } : undefined}>
            <b aria-live="polite">{busy ? "Saving…" : `${chosen.length} selected`}</b>
            {view === "open" && <button type="button" className="opx-btn" disabled={none} onClick={() => runBulk({ do: "done" }, "Marked done")}>Mark done</button>}
            <select className="opx-input" aria-label="Set the priority of the selected rows" disabled={none} value="" onChange={(e) => { const p = e.target.value as "urgent" | "high" | "medium" | "low"; if (p) runBulk({ do: "priority", priority: p }, "Priority set") }}>
              <option value="">Set priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Normal</option><option value="low">Low</option>
            </select>
            <label className="opx-bulkdue"><span>Due</span> <input type="date" className="opx-input" aria-label="Set the due date of the selected rows" disabled={none} value="" onChange={(e) => { if (e.target.value) runBulk({ do: "due", dueDate: new Date(`${e.target.value}T12:00:00`).toISOString() }, "Due date set") }} /></label>
            <button type="button" className="opx-btn" disabled={none || todos === 0} title={todos === 0 && chosen.length ? "Only todos can be deleted here; tasks are removed in their project" : undefined} onClick={() => runBulk({ do: "delete" }, "Deleted")}>Delete {todos || ""} todo{todos === 1 ? "" : "s"}</button>
            <button type="button" className="opx-link opx-act" onClick={stopPicking}>Stop selecting</button>
          </div>
        )
      })()}
      {node}
    </div>
  )
}

// ─── Calendar ───────────────────────────────────────────────────────────────

interface AgendaItem { id: string; type: string; title: string; startTime: string; isAllDay: boolean; color: string | null }

/** Events, milestones and bills from the shared calendar, as read-only entries. Todos come from /api/work instead, so they aren't shown twice. */
function agendaUrl(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 7, 1)
  return `/api/calendar/agenda?${new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() })}`
}

export function WorkCalendar({ refreshKey = 0, toolbar }: { refreshKey?: number; toolbar?: React.ReactNode }) {
  const workQ = useJson(`/api/work?view=open&r=${refreshKey}`)
  const agendaQ = useJson(`${agendaUrl()}&r=${refreshKey}`)
  const work = unwrap<WorkData>(workQ.data)

  const items = useMemo(() => (work?.items || []).map((w) => ({
    kind: w.kind,
    item: w.kind === "step"
      ? { id: w.id, title: w.title, status: w.status, priority: w.priority, start_date: w.startDate ?? null, end_date: w.dueDate, projectId: w.projectId, projectName: w.projectName, description: w.description }
      : { id: w.id, title: w.title, status: w.status, priority: w.priority, dueDate: w.dueDate, projectId: w.projectId, projectName: w.projectName, description: w.description },
  })), [work])

  const extras: CalExtra[] = useMemo(() => (unwrap<AgendaItem[]>(agendaQ.data) || [])
    .filter((a) => a.type !== "todo" && a.startTime)
    .map((a) => {
      // All-day entries are calendar days; timed events fall on their local day.
      const d = a.isAllDay ? dayOf(a.startTime) : new Date(a.startTime)
      return d ? { id: `${a.type}-${a.id}`, title: a.title, day: dayKey(d), type: a.type, color: a.color } : null
    })
    .filter(Boolean) as CalExtra[], [agendaQ.data])

  const keys = work?.statusKeys || {}
  return (
    <PlanCalendar
      items={items}
      loading={workQ.loading && !workQ.data}
      error={workQ.error}
      reload={() => { workQ.reload(); agendaQ.reload() }}
      markDone={(e, next) => setWorkDone({ kind: e.kind, id: e.item.id, projectId: (e.item as any).projectId }, next, keys)}
      saveRange={(e, p: PlannedRange) => e.kind === "todo"
        ? patchJson(`/api/todos/${e.item.id}`, { dueDate: p.due || p.start })
        : patchJson(`/api/projects/${(e.item as any).projectId}/steps/${e.item.id}`, { start_date: p.start, end_date: p.due || p.start })}
      groupOf={(e) => (e.item as any).projectName || "Personal"}
      extras={extras}
      toolbar={toolbar}
    />
  )
}

