/**
 * Idea -> KanbanTask/KanbanColumn.
 *
 * Pure: no React, no DOM, `now` injected. Sibling of adapt.ts, which does the
 * same job for project steps. Both feed the same board component, which is the
 * point — the Ideas board and the project board were two separate
 * implementations that drifted apart, and only one of them ever got fixed.
 */

import type { Idea, IdeaLifecycle } from "@/lib/types"
import type { KanbanColumn, KanbanTask } from "./KanbanBoard"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "4 days ago" — the only time signal an idea carries. */
export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return undefined
  const d = now.getTime() - t
  if (d < 0) return undefined
  if (d < HOUR) {
    const m = Math.max(1, Math.floor(d / MINUTE))
    return `${m}m ago`
  }
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  const days = Math.floor(d / DAY)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/**
 * Counters an idea can carry. Each is omitted when zero — a seed idea with no
 * facets should show nothing rather than a row of zeroes.
 */
export function ideaFootnotes(idea: Idea, now: Date = new Date()): Array<{ label: string; title?: string }> {
  const out: Array<{ label: string; title?: string }> = []
  if (idea.facetCount) out.push({ label: `◇ ${idea.facetCount}`, title: "Facets" })
  if (idea.branchCount) out.push({ label: `⑂ ${idea.branchCount}`, title: "Branches" })
  if (idea.validationCount) out.push({ label: `✓ ${idea.validationCount}`, title: "Validations" })
  const age = relativeAge(idea.createdAt, now)
  if (age) out.push({ label: age, title: `Created ${idea.createdAt}` })
  return out
}

export interface IdeaColumnDef {
  id: IdeaLifecycle
  label: string
  /** CSS colour, including var(--j-*) — the board applies it directly. */
  color: string
}

export function toIdeaTask(idea: Idea, now: Date = new Date()): KanbanTask {
  return {
    id: idea.id,
    title: idea.title,
    note: idea.description ?? undefined,
    // Ideas have a real `category` column, unlike steps where the first tag
    // stands in for one. So every tag stays a pill.
    category: idea.category ?? undefined,
    tags: (idea.tags ?? []).map((label) => ({ label, color: "var(--j-ring-strong)" })),
    footnotes: ideaFootnotes(idea, now),
    done: idea.lifecycle === "archived",
  }
}

export function toIdeaColumns(
  columns: IdeaColumnDef[],
  ideasFor: (lifecycle: IdeaLifecycle) => Idea[],
  now: Date = new Date(),
): KanbanColumn[] {
  return columns.map((col) => ({
    id: col.id,
    name: col.label,
    accentHex: col.color,
    tasks: ideasFor(col.id).map((i) => toIdeaTask(i, now)),
  }))
}
