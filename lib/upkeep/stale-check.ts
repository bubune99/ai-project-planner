/**
 * The stale-task check (card c28cb7e1 part 4; rules from the 2026-11-14 audit, document 5cee648d). Pure: no
 * database, `now` passed in. Check file: stale-check.assert.ts.
 *
 * Three kinds of finding, each with who deals with it:
 *   idle        a card in progress that has not moved in IDLE_DAYS. Under the one-board rule (owner, 2026-11-16) a
 *               card is in progress only while an agent holds it, so an agent puts it back to Up next with a note.
 *               Never a question for the owner.
 *   duplicate   two open cards in one project with the same title. Merging removes a card the owner made, so this
 *               is his: one grouped question per project.
 *   unreviewed  open cards carried over from the old todo list that nobody has touched since. Agents sort them;
 *               only the unclear ones go to him later. Counted here, never asked about here.
 * The check moves nothing by itself.
 */
export const IDLE_DAYS = 14
export const UNREVIEWED_DAYS = 30
const DAY = 86_400_000

export interface StepRow {
  id: string
  projectId: string
  project?: string
  title: string
  status: string
  statusKind: "open" | "active" | "done" | "closed"
  updatedAt: string
  createdAt: string
  fromTodo: boolean
}

export interface Finding { kind: "idle" | "duplicate" | "unreviewed"; projectId: string; project?: string; stepIds: string[]; titles: string[]; days?: number }

/** A title as a person reads it: case, spacing and trailing punctuation do not make two titles different. */
export function titleKey(title: string): string {
  return String(title || "").toLowerCase().replace(/\s+/g, " ").replace(/[.!?:;,\s]+$/, "").trim()
}

const daysSince = (iso: string, nowMs: number) => Math.floor((nowMs - Date.parse(iso)) / DAY)

export function findStale(rows: StepRow[], nowMs: number): Finding[] {
  const open = rows.filter((r) => r.statusKind === "open" || r.statusKind === "active")
  const out: Finding[] = []
  for (const r of open) {
    const d = daysSince(r.updatedAt, nowMs)
    if (r.statusKind === "active" && d >= IDLE_DAYS) out.push({ kind: "idle", projectId: r.projectId, project: r.project, stepIds: [r.id], titles: [r.title], days: d })
  }
  const groups = new Map<string, StepRow[]>()
  for (const r of open) {
    const k = `${r.projectId}\u0000${titleKey(r.title)}`
    if (!titleKey(r.title)) continue
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const sorted = g.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    out.push({ kind: "duplicate", projectId: sorted[0].projectId, project: sorted[0].project, stepIds: sorted.map((x) => x.id), titles: sorted.map((x) => x.title) })
  }
  const byProject = new Map<string, StepRow[]>()
  for (const r of open) {
    if (r.fromTodo && r.statusKind === "open" && daysSince(r.updatedAt, nowMs) >= UNREVIEWED_DAYS) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r])
  }
  for (const [projectId, g] of byProject) out.push({ kind: "unreviewed", projectId, project: g[0].project, stepIds: g.map((x) => x.id), titles: g.map((x) => x.title) })
  return out
}

/** The one question per project for what is his (duplicates), or null when nothing there needs him. */
export function questionFor(findings: Finding[], projectId: string): { question: string; options: string[]; context: string } | null {
  const dups = findings.filter((f) => f.kind === "duplicate" && f.projectId === projectId)
  if (!dups.length) return null
  const name = dups[0].project ? ` in ${dups[0].project}` : ""
  const n = dups.length
  return {
    question: `${n} card${n === 1 ? " has" : "s have"} a twin with the same title${name}. Merge them?`,
    options: ["Merge each pair, keep the older card and its history", "Keep them all", "Show me the pairs first"],
    context: [
      "Found by the stale-task check. Each line is a pair (or more) of open cards with the same title; the first is the older one.",
      ...dups.slice(0, 20).map((d) => `- "${d.titles[0]}" (${d.stepIds.length} cards: ${d.stepIds.map((id) => id.slice(0, 8)).join(", ")})`),
      dups.length > 20 ? `- and ${dups.length - 20} more` : "",
      "On merge, an agent moves the newer cards' comments onto the older card and closes the newer ones with a note. Nothing is merged without your answer.",
    ].filter(Boolean).join("\n"),
  }
}

/** Counts for the run record and the reply. */
export function summarize(findings: Finding[]): { idle: number; duplicate: number; unreviewed: number } {
  return {
    idle: findings.filter((f) => f.kind === "idle").length,
    duplicate: findings.filter((f) => f.kind === "duplicate").length,
    unreviewed: findings.filter((f) => f.kind === "unreviewed").reduce((n, f) => n + f.stepIds.length, 0),
  }
}
