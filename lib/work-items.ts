/**
 * "My Work" — one list over two stores, without showing anything twice.
 *
 * Migration 057 copied every project-linked todo into project_steps and left
 * the todo behind as a pointer (todos.step_id). Nothing kept the pair in sync,
 * so /todos showed 358 copies of tasks that also lived on project boards —
 * complete one in either place and the other stayed open.
 *
 * The rule that removes the duplication without losing anything:
 *
 *   - a todo WITH a step_id is a mirror; its step is the real item, so the
 *     todo is dropped and the step is shown;
 *   - a todo WITHOUT a step_id is real, unmirrored work — personal todos, and
 *     project todos created after the migration — so it is shown as-is.
 *
 * Pure: no React, no DB, `now` injected. lib/work-items.assert.ts runs it.
 */

export type WorkKind = "step" | "todo"
export type WorkPriority = "urgent" | "high" | "medium" | "low"

export interface WorkItem {
  kind: WorkKind
  id: string
  title: string
  description: string | null
  /** Raw status as stored — a project status key for steps, a todo status for todos. */
  status: string
  /** Normalised: open | active | done | closed. Steps resolve custom statuses server-side. */
  statusKind: "open" | "active" | "done" | "closed"
  priority: WorkPriority | null
  dueDate: string | null
  projectId: string | null
  projectName: string | null
  createdAt: string
  updatedAt: string
}

/** A todo as the merge needs to see it — only the fields that matter here. */
export interface TodoRow {
  id: string
  stepId: string | null
}

/**
 * Drop todos that are mirrors of a step. Returns the ids that survive.
 * Kept separate from the fetch so the rule can be asserted on its own.
 */
export function unmirroredTodoIds(todos: TodoRow[]): Set<string> {
  return new Set(todos.filter((t) => !t.stepId).map((t) => t.id))
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function dayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Order inside a group: overdue first, then by priority, then soonest due,
 * then most recently touched. Undated items sort after dated ones of the same
 * priority — a date is a commitment, and commitments come first.
 */
export function compareWork(a: WorkItem, b: WorkItem, now: Date = new Date()): number {
  const today = dayKey(now)
  const over = (w: WorkItem) => (w.dueDate && dayKey(new Date(w.dueDate)) < today ? 0 : 1)
  const o = over(a) - over(b)
  if (o) return o

  const pa = PRIORITY_RANK[a.priority ?? ""] ?? 4
  const pb = PRIORITY_RANK[b.priority ?? ""] ?? 4
  if (pa !== pb) return pa - pb

  if (a.dueDate && b.dueDate) {
    const d = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    if (d) return d
  } else if (a.dueDate || b.dueDate) {
    return a.dueDate ? -1 : 1
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

export interface WorkGroup {
  key: string
  label: string
  /** null for the personal / unfiled group */
  projectId: string | null
  items: WorkItem[]
  overdue: number
}

const PERSONAL_KEY = "__personal__"

/**
 * Group by project. Biggest groups first, because that is where the work is;
 * the personal group always goes last so it does not get buried mid-list or
 * crowd out project work at the top.
 */
export function groupWork(items: WorkItem[], now: Date = new Date()): WorkGroup[] {
  const today = dayKey(now)
  const map = new Map<string, WorkGroup>()

  for (const it of items) {
    const key = it.projectId ?? PERSONAL_KEY
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        label: it.projectId ? it.projectName || "Untitled project" : "Personal",
        projectId: it.projectId,
        items: [],
        overdue: 0,
      }
      map.set(key, g)
    }
    g.items.push(it)
    if (it.dueDate && dayKey(new Date(it.dueDate)) < today) g.overdue++
  }

  const groups = [...map.values()]
  for (const g of groups) g.items.sort((a, b) => compareWork(a, b, now))

  return groups.sort((a, b) => {
    if (a.key === PERSONAL_KEY) return 1
    if (b.key === PERSONAL_KEY) return -1
    return b.items.length - a.items.length || a.label.localeCompare(b.label)
  })
}

/** "Overdue 3d", "Today", "Tomorrow", "Oct 9", or "" for undated. */
export function dueText(dueDate: string | null, now: Date = new Date()): { text: string; overdue: boolean; soon: boolean } {
  if (!dueDate) return { text: "", overdue: false, soon: false }
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return { text: "", overdue: false, soon: false }
  const diff = Math.round((dayKey(d) - dayKey(now)) / 86_400_000)
  if (diff < 0) return { text: `Overdue ${-diff}d`, overdue: true, soon: false }
  if (diff === 0) return { text: "Today", overdue: false, soon: true }
  if (diff === 1) return { text: "Tomorrow", overdue: false, soon: true }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return { text: `${months[d.getMonth()]} ${d.getDate()}`, overdue: false, soon: diff <= 7 }
}

/** Free-text filter over title, description and project. Case-insensitive. */
export function matchesQuery(it: WorkItem, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    it.title.toLowerCase().includes(s) ||
    (it.description ?? "").toLowerCase().includes(s) ||
    (it.projectName ?? "").toLowerCase().includes(s)
  )
}
