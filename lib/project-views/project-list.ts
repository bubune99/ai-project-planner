/**
 * The Projects list: what is shown for a chosen status, the count beside each status, and the figures at the top.
 * Pure. Checked in project-list.assert.ts.
 *
 * The page used to ask the server for only the chosen status and then count from what came back, so choosing
 * "Planning" made "All" read the number of planning projects, every other status read 0, and the totals at the top
 * shrank with it.
 */
export type ProjectStatusFilter = "all" | "in_progress" | "planning" | "review" | "on_hold" | "completed"
export const PROJECT_STATUSES: [ProjectStatusFilter, string][] = [
  ["all", "Any status"], ["in_progress", "Active"], ["planning", "Planning"], ["review", "Review"], ["on_hold", "On hold"], ["completed", "Done"],
]
interface Row { status: string; health?: string; progress?: number }

export function countByStatus(all: Row[]): Record<ProjectStatusFilter, number> {
  const out = {} as Record<ProjectStatusFilter, number>
  for (const [k] of PROJECT_STATUSES) out[k] = k === "all" ? all.length : all.filter((p) => p.status === k).length
  return out
}

export function showing<T extends Row>(all: T[], status: ProjectStatusFilter): T[] {
  return status === "all" ? all : all.filter((p) => p.status === status)
}

export function listStats(all: Row[]) {
  const total = all.length
  return {
    total,
    active: all.filter((p) => p.status === "in_progress").length,
    atRisk: all.filter((p) => p.health === "attention" || p.health === "critical").length,
    avgProgress: total ? Math.round(all.reduce((s, p) => s + (p.progress || 0), 0) / total) : 0,
  }
}
