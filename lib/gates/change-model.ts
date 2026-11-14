/**
 * Changes, shown before and after: every change made to a screen is kept with a
 * real screenshot of how it was and how it is, what it answers, and where it has
 * been proved. The owner looks at the pair and says whether the change was good,
 * with their thoughts. What they say is the lesson the next change is made with.
 *
 * Pure: no database, no React. Checked by change-model.assert.ts.
 */

/** Where the "after" picture was taken. A mock is the live page changed in the browser; nothing was built. */
export type ChangeStage = "mock" | "staging" | "production"
export type ChangeVerdict = "good" | "bad"

export interface Change {
  title: string
  /** The finding it answers: what was wrong, and how that was found. */
  why: string
  route?: string
  /** The check it belongs to, when it has one. */
  checkKey?: string
  stage: ChangeStage
  build?: string
}
export interface StoredChange extends Change {
  id: string; at: string; actor: "agent" | "owner"
  verdict?: ChangeVerdict; note?: string; decidedAt?: string
}

const STAGES: ChangeStage[] = ["mock", "staging", "production"]
export const STAGE_WORD: Record<ChangeStage, string> = { mock: "Tried on the live page, not built", staging: "Built, on staging", production: "Live in production" }

/** Reads a change sent by an agent: keeps the known fields, trims the text, and says what is wrong with it. */
export function parseChange(raw: unknown): { change: Change; errors: string[] } {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const text = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
  const errors: string[] = []
  const title = text(o.title, 160), why = text(o.why)
  if (!title) errors.push("A change needs a title: what was changed, in a few words")
  if (!why) errors.push("A change says what it answers: what was wrong and how that was found")
  const stage = STAGES.find((s) => s === o.stage)
  if (!stage) errors.push("Say where the after picture was taken: mock, staging or production")
  const opt = (k: "route" | "checkKey" | "build") => { const v = text(o[k], 200); return v ? { [k]: v } : {} }
  return { change: { title, why, stage: stage ?? "mock", ...opt("route"), ...opt("checkKey"), ...opt("build") }, errors }
}

/** The owner's judgment on a change. A change judged not good has to say why, or nothing is learned from it. */
export function parseVerdict(raw: unknown): { verdict: ChangeVerdict | null; note: string; errors: string[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const verdict = o.verdict === "good" || o.verdict === "bad" ? o.verdict : null
  const note = typeof o.note === "string" ? o.note.replace(/\s+/g, " ").trim().slice(0, 600) : ""
  const errors: string[] = []
  if (!verdict) errors.push("Say whether the change was good or not")
  if (verdict === "bad" && !note) errors.push("Say what was wrong with it, so the next change does not repeat it")
  return { verdict, note, errors }
}

export interface Lessons { waiting: number; good: number; bad: number; said: { verdict: ChangeVerdict; title: string; note: string; at: string }[] }
/**
 * What the owner's judgments add up to, newest first: how many changes are waiting for them, how many they liked,
 * and everything they wrote. An agent reads `said` before proposing a change of the same kind.
 */
export function lessons(changes: StoredChange[]): Lessons {
  const judged = changes.filter((c) => c.verdict)
  return {
    waiting: changes.length - judged.length,
    good: judged.filter((c) => c.verdict === "good").length,
    bad: judged.filter((c) => c.verdict === "bad").length,
    said: judged.filter((c) => c.note).sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).map((c) => ({ verdict: c.verdict!, title: c.title, note: c.note!, at: c.decidedAt ?? c.at })),
  }
}

export function lessonsLine(l: Lessons): string {
  const total = l.good + l.bad
  if (!total && !l.waiting) return "No changes have been recorded yet."
  return `${l.waiting} waiting for the owner to look at. ${total ? `Of ${total} judged, ${l.good} good and ${l.bad} not.` : "None judged yet."}`
}
