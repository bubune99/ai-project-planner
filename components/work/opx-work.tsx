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

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { compareWork, type WorkItem } from "@/lib/work-items"
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

const KIND_LABEL: Record<string, string> = { open: "To do", active: "In progress", done: "Done", closed: "Closed" }
const KIND_COLOR: Record<string, string> = { open: "#8a94a3", active: "var(--opx-accent)", done: "var(--opx-good)", closed: "#8a94a3" }

// ─── List ───────────────────────────────────────────────────────────────────

export function WorkList({ refreshKey = 0, onEditTodo }: { refreshKey?: number; onEditTodo?: (id: string) => void }) {
  const [view, setView] = useState<"open" | "done">("open")
  const { data, loading, error, reload } = useJson(`/api/work?view=${view}&r=${refreshKey}`)
  const { tipProps, node } = useHoverTip()
  const [flip, setFlip] = useState<Record<string, boolean>>({})
  const work = unwrap<WorkData>(data)
  const groups = useMemo(() => {
    const now = new Date()
    const sorted = [...(work?.items || [])].sort((a, b) => compareWork(a, b, now))
    const m = new Map<string, WorkItem[]>()
    for (const w of sorted) { const g = w.projectName || "Personal"; m.set(g, [...(m.get(g) || []), w]) }
    return [...m.entries()].sort((a, b) => (a[0] === "Personal" ? 1 : b[0] === "Personal" ? -1 : b[1].length - a[1].length))
  }, [work])

  const isDone = (w: WorkItem) => flip[w.id] ?? w.statusKind === "done"
  const toggle = async (w: WorkItem) => {
    const next = !isDone(w)
    setFlip((f) => ({ ...f, [w.id]: next }))
    try { await setWorkDone(w, next, work?.statusKeys || {}) }
    catch (e) { setFlip((f) => ({ ...f, [w.id]: !next })); toast.error(e instanceof Error ? e.message : "Couldn't update it") }
  }

  const total = work?.items.length ?? 0
  const today = dayOf(new Date())!
  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <div className="opx-row">
        <Seg label="Show" value={view} onChange={(v) => { setView(v); setFlip({}) }} options={[["open", "Open"], ["done", "Done"]]} />
        <span className="opx-muted" style={{ fontSize: 13 }}>{loading && !data ? "Loading…" : `${total} ${view === "open" ? "open" : "done"} across ${groups.length} group${groups.length === 1 ? "" : "s"}`}</span>
      </div>
      {loading && !data && <Loading what="your work" />}
      {error && <Failed what="your work" error={error} retry={reload} />}
      {!loading && !error && total === 0 && <div className="opx-empty">{view === "open" ? "Nothing open. Add something above." : "Nothing finished yet."}</div>}
      {groups.map(([g, list]) => (
        <section key={g} className="opx-sec" style={{ padding: "8px 0" }}>
          <div className="opx-sech" style={{ padding: "10px 18px 6px" }}>
            <h2 style={{ fontSize: 16 }}>{g}</h2><span className="opx-n">{list.length}</span>
            {list[0]?.projectId && <a className="opx-link" style={{ marginLeft: "auto" }} href={`/project/${list[0].projectId}?tab=tasks&view=list`}>Open project ›</a>}
          </div>
          <div className="opx-lv opx-lvp opx-lvh"><span /><span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span>Type</span></div>
          {list.map((w) => {
            const done = isDone(w)
            const due = dayOf(w.dueDate)
            const late = due && due < today && !done
            return (
              <div key={w.id} className={`opx-lv opx-lvp${done ? " dn" : ""}`} {...tipProps(w.description)}>
                <button className={`opx-ck${done ? " on" : ""}`} aria-label={done ? `Reopen ${w.title}` : `Mark ${w.title} done`} onClick={() => toggle(w)} />
                {w.kind === "todo" && onEditTodo
                  ? <button className="opx-link" style={{ textAlign: "left", fontWeight: 600, fontSize: 14.5, color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => onEditTodo(w.id)}>{w.title}</button>
                  : <b>{w.title}</b>}
                <span className="opx-row" style={{ gap: 6, fontSize: 12.5 }}><i className="opx-dot" style={{ background: KIND_COLOR[w.statusKind], width: 7, height: 7 }} />{KIND_LABEL[w.statusKind]}</span>
                <Priority p={w.priority} />
                <span style={{ fontSize: 13, color: late ? "var(--opx-hot)" : "var(--opx-muted)" }}>{due ? fmtDate(due) : "—"}</span>
                <span className="opx-muted" style={{ fontSize: 12.5 }}>{w.kind === "todo" ? "Todo" : "Task"}</span>
              </div>
            )
          })}
        </section>
      ))}
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

