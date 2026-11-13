/**
 * The project's change log: decisions, shipped steps, ideas, flow changes and
 * questions on one dated line. Pure; checked by timeline.assert.ts.
 */

export type TimelineKind = "Decided" | "Shipped" | "Idea" | "Flow changed" | "Asked you"
export const TIMELINE_KINDS: TimelineKind[] = ["Decided", "Shipped", "Idea", "Flow changed", "Asked you"]
export const KIND_COLOR: Record<TimelineKind, string> = {
  Decided: "var(--opx-good)",
  Shipped: "var(--opx-accent)",
  Idea: "#8a94a3",
  "Flow changed": "var(--opx-violet)",
  "Asked you": "var(--opx-warn)",
}

export interface TimelineEvent {
  at: string
  kind: TimelineKind
  title: string
  summary: string
  tags: string[]
  ref?: { type: "decision" | "idea" | "step" | "doc" | "question"; id: string }
}

export interface TimelineSources {
  decisions: { id: string; title: string; summary?: string | null; createdAt?: string | null; tags?: string[] | null }[]
  steps: { id: string; title: string; description?: string | null; completed_at?: string | null; is_subtask?: boolean | null }[]
  ideas: { id: string; title: string; description?: string | null; createdAt?: string | null }[]
  docs: { id: string; title: string; content?: string | null; updated_at?: string | null }[]
  questions: { id: string; question?: string | null; title?: string | null; context?: string | null; createdAt?: string | null; created_at?: string | null }[]
}

/** Strip code blocks, markdown marks and agent refs like [step:abc] so a summary reads as prose. */
export function cleanSummary(s: string | null | undefined): string {
  return String(s || "")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\[[a-z-]+:[^\]]+\]/g, "")
    .replace(/[#*`|>]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function buildTimeline(src: TimelineSources): TimelineEvent[] {
  const ev: TimelineEvent[] = [
    ...src.decisions.filter((d) => d.createdAt).map((d) => ({ at: d.createdAt!, kind: "Decided" as const, title: d.title, summary: cleanSummary(d.summary), tags: d.tags || [], ref: { type: "decision" as const, id: d.id } })),
    ...src.steps.filter((s) => s.completed_at && !s.is_subtask).map((s) => ({ at: s.completed_at!, kind: "Shipped" as const, title: s.title, summary: cleanSummary(s.description), tags: [], ref: { type: "step" as const, id: s.id } })),
    ...src.ideas.filter((i) => i.createdAt).map((i) => ({ at: i.createdAt!, kind: "Idea" as const, title: i.title, summary: cleanSummary(i.description), tags: [], ref: { type: "idea" as const, id: i.id } })),
    ...src.docs.filter((d) => d.updated_at && /^flow /i.test(d.title)).map((d) => ({ at: d.updated_at!, kind: "Flow changed" as const, title: d.title, summary: cleanSummary(d.content), tags: [], ref: { type: "doc" as const, id: d.id } })),
    ...src.questions.map((q) => ({ at: q.createdAt || q.created_at || "", kind: "Asked you" as const, title: q.question || q.title || "Question", summary: cleanSummary(q.context), tags: [], ref: { type: "question" as const, id: q.id } })).filter((e) => e.at),
  ]
  return ev.sort((a, b) => +new Date(b.at) - +new Date(a.at))
}

/** Group consecutive events by month label, newest month first. */
export function byMonth(events: TimelineEvent[]): { month: string; events: TimelineEvent[] }[] {
  const out: { month: string; events: TimelineEvent[] }[] = []
  for (const e of events) {
    const month = new Date(e.at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    const last = out[out.length - 1]
    if (last && last.month === month) last.events.push(e)
    else out.push({ month, events: [e] })
  }
  return out
}
