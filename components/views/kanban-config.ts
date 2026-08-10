import type { BoardStep, StepStatus } from "@/lib/types"

export type GroupBy = "status" | "priority" | "agent" | "phase"
export type SortBy = "manual" | "priority" | "due" | "estimate" | "title"

export interface ColumnDef {
  key: string
  label: string
  /** Tailwind bg-* class for the header pill + column accents */
  pillClass: string
  dotClass: string
  /** Columns that can't receive drops (no way to persist the value) */
  isDropDisabled?: boolean
  /** Hidden unless it has cards (e.g. paused/failed) */
  hideWhenEmpty?: boolean
}

export const NONE_KEY = "__none__"

export const STATUS_COLUMNS: ColumnDef[] = [
  { key: "pending", label: "To Do", pillClass: "bg-zinc-500/15 text-zinc-300", dotClass: "bg-zinc-400" },
  { key: "in-progress", label: "In Progress", pillClass: "bg-blue-500/15 text-blue-400", dotClass: "bg-blue-500" },
  { key: "blocked", label: "Blocked", pillClass: "bg-red-500/15 text-red-400", dotClass: "bg-red-500" },
  { key: "paused", label: "Paused", pillClass: "bg-amber-500/15 text-amber-400", dotClass: "bg-amber-500", hideWhenEmpty: true },
  { key: "failed", label: "Failed", pillClass: "bg-rose-600/15 text-rose-400", dotClass: "bg-rose-600", hideWhenEmpty: true },
  { key: "completed", label: "Complete", pillClass: "bg-green-500/15 text-green-400", dotClass: "bg-green-500" },
]

export const PRIORITY_COLUMNS: ColumnDef[] = [
  { key: "high", label: "High", pillClass: "bg-red-500/15 text-red-400", dotClass: "bg-red-500" },
  { key: "medium", label: "Medium", pillClass: "bg-yellow-500/15 text-yellow-400", dotClass: "bg-yellow-500" },
  { key: "low", label: "Low", pillClass: "bg-green-500/15 text-green-400", dotClass: "bg-green-500" },
  { key: NONE_KEY, label: "No Priority", pillClass: "bg-zinc-500/15 text-zinc-300", dotClass: "bg-zinc-400", hideWhenEmpty: true },
]

export const AGENT_COLUMNS: ColumnDef[] = [
  { key: "claude", label: "Claude", pillClass: "bg-purple-500/15 text-purple-400", dotClass: "bg-purple-500" },
  { key: "v0", label: "v0", pillClass: "bg-blue-500/15 text-blue-400", dotClass: "bg-blue-500" },
  { key: "gemini", label: "Gemini", pillClass: "bg-green-500/15 text-green-400", dotClass: "bg-green-500" },
  { key: "gpt", label: "GPT", pillClass: "bg-orange-500/15 text-orange-400", dotClass: "bg-orange-500" },
  { key: NONE_KEY, label: "Unassigned", pillClass: "bg-zinc-500/15 text-zinc-300", dotClass: "bg-zinc-400" },
]

const PHASE_PILLS = [
  "bg-sky-500/15 text-sky-400",
  "bg-violet-500/15 text-violet-400",
  "bg-teal-500/15 text-teal-400",
  "bg-pink-500/15 text-pink-400",
  "bg-lime-500/15 text-lime-400",
  "bg-cyan-500/15 text-cyan-400",
]
const PHASE_DOTS = [
  "bg-sky-500", "bg-violet-500", "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-cyan-500",
]

export function phaseColumns(steps: BoardStep[]): ColumnDef[] {
  const phases = Array.from(new Set(steps.map((s) => s.phase).filter((p): p is string => !!p)))
  const cols: ColumnDef[] = phases.map((p, i) => ({
    key: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
    pillClass: PHASE_PILLS[i % PHASE_PILLS.length],
    dotClass: PHASE_DOTS[i % PHASE_DOTS.length],
  }))
  // phase is NOT NULL in the schema, so a "no phase" bucket can't be dropped into
  cols.push({
    key: NONE_KEY,
    label: "No Phase",
    pillClass: "bg-zinc-500/15 text-zinc-300",
    dotClass: "bg-zinc-400",
    isDropDisabled: true,
    hideWhenEmpty: true,
  })
  return cols
}

export function columnsFor(groupBy: GroupBy, steps: BoardStep[]): ColumnDef[] {
  switch (groupBy) {
    case "status": return STATUS_COLUMNS
    case "priority": return PRIORITY_COLUMNS
    case "agent": return AGENT_COLUMNS
    case "phase": return phaseColumns(steps)
  }
}

export function groupKeyOf(step: BoardStep, groupBy: GroupBy): string {
  switch (groupBy) {
    case "status": return step.status
    case "priority": return step.priority ?? NONE_KEY
    case "agent": return step.assigned_agent ?? NONE_KEY
    case "phase": return step.phase || NONE_KEY
  }
}

/** The PATCH body that moves a step into the given column under the given grouping. */
export function patchForMove(groupBy: GroupBy, columnKey: string): Record<string, unknown> | null {
  switch (groupBy) {
    case "status": return { status: columnKey }
    case "priority": return { priority: columnKey === NONE_KEY ? null : columnKey }
    case "agent": return { assigned_agent: columnKey === NONE_KEY ? null : columnKey }
    case "phase": return columnKey === NONE_KEY ? null : { phase: columnKey }
  }
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function sortSteps(steps: BoardStep[], sortBy: SortBy): BoardStep[] {
  const sorted = [...steps]
  switch (sortBy) {
    case "manual":
      sorted.sort((a, b) => a.order_index - b.order_index)
      break
    case "priority":
      sorted.sort((a, b) => (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3))
      break
    case "due":
      sorted.sort((a, b) => {
        if (!a.end_date && !b.end_date) return a.order_index - b.order_index
        if (!a.end_date) return 1
        if (!b.end_date) return -1
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
      })
      break
    case "estimate":
      sorted.sort((a, b) => Number(b.estimated_hours ?? 0) - Number(a.estimated_hours ?? 0))
      break
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title))
      break
  }
  return sorted
}

export const STATUS_LABELS: Record<StepStatus, string> = {
  pending: "To Do",
  "in-progress": "In Progress",
  completed: "Complete",
  blocked: "Blocked",
  paused: "Paused",
  failed: "Failed",
}

export const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
}

export const AGENT_AVATAR: Record<string, string> = {
  v0: "bg-blue-500",
  claude: "bg-purple-500",
  gemini: "bg-green-500",
  gpt: "bg-orange-500",
}

/** Normalize the tasks JSONB (historically string[]) into checklist items. */
export function normalizeChecklist(tasks: BoardStep["tasks"]): Array<{ title: string; done: boolean }> {
  if (!Array.isArray(tasks)) return []
  return tasks.map((t) =>
    typeof t === "string" ? { title: t, done: false } : { title: t.title ?? "", done: !!t.done }
  )
}
