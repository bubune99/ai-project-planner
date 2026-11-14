/*
 * What in one project is waiting on its owner, worked out from three records
 * that already exist: questions agents asked (the inbox), changes that were
 * made and not yet judged (Changes), and what walks left for the owner
 * (People and flows). Nothing here is stored: it is read each time.
 *
 * The owner decides preferences, not errors. So errors and gaps found by walks
 * are counted separately as the agents' work: shown so the owner can see what
 * was found, never asked of them.
 *
 * Pure: no React, no SQL, no clock. Assertions in needs-you.assert.ts.
 */
import type { InboxItem } from "@/lib/inbox"
import { openFindings, type Finding, type StoredWalk } from "@/lib/walks/walk-model"

export interface WaitingChange { id: string; title: string; stage: string; at: string; verdict?: string }
export type OpenFinding = Finding & { walk: string; goal: string; who: "agents" | "owner" }

export interface NeedsYou {
  /** Questions asked about this project, oldest first. */
  questions: InboxItem[]
  /** Changes made and not yet judged, newest first. */
  changes: WaitingChange[]
  /** Findings that are the owner's call: how it feels, what they prefer. */
  yours: OpenFinding[]
  /** Findings agents must fix: shown, never asked. */
  agents: OpenFinding[]
  walks: { total: number; reached: number; stopped: number }
  /** How many things need an answer or a judgment from the owner. */
  count: number
}

export function needsYou(projectId: string, input: { inbox: InboxItem[]; changes: WaitingChange[]; walks: StoredWalk[] }): NeedsYou {
  const questions = input.inbox.filter((q) => q.projectId === projectId).sort((a, b) => a.askedAt.localeCompare(b.askedAt))
  const changes = input.changes.filter((c) => !c.verdict).sort((a, b) => b.at.localeCompare(a.at))
  const open = openFindings(input.walks)
  const yours = open.filter((f) => f.who === "owner")
  const agents = open.filter((f) => f.who === "agents")
  const reached = input.walks.filter((w) => w.outcome === "reached").length
  return {
    questions, changes, yours, agents,
    walks: { total: input.walks.length, reached, stopped: input.walks.length - reached },
    count: questions.length + changes.length + yours.length,
  }
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** One sentence for the top of the section. */
export function needsYouLine(y: NeedsYou): string {
  const parts = [
    y.questions.length ? n(y.questions.length, "question to answer", "questions to answer") : "",
    y.changes.length ? n(y.changes.length, "change to judge", "changes to judge") : "",
    y.yours.length ? n(y.yours.length, "finding that is your call", "findings that are your call") : "",
  ].filter(Boolean)
  if (!parts.length) return "Nothing is waiting on you."
  return parts.length === 1 ? `${parts[0]}.` : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`
}
