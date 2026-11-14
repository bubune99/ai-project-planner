/*
 * What the owner is told about on their phone, and what each notice says.
 *
 * Two things reach them today: a question an agent could not answer for them,
 * and a change that is ready for them to judge. Each can be turned off. A
 * notice is short enough to act on from the lock screen and opens the place
 * where it is answered.
 *
 * Pure: no React, no SQL, no clock. Assertions in notify-model.assert.ts.
 */

export const KINDS = ["question", "change"] as const
export type NotifyKind = (typeof KINDS)[number]
export type NotifyPrefs = Record<NotifyKind, boolean>

export const KIND_LABEL: Record<NotifyKind, { name: string; says: string }> = {
  question: { name: "Questions for me", says: "An agent needs a decision only you can make. Work on that item waits until you answer." },
  change: { name: "Changes to judge", says: "A change was made and its before and after pictures are ready for you to look at." },
}

export const DEFAULT_PREFS: NotifyPrefs = { question: true, change: true }

/** Reads stored or posted preferences: unknown keys are dropped, anything not a boolean falls back to the default. */
export function parsePrefs(raw: unknown): NotifyPrefs {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(KINDS.map((k) => [k, typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_PREFS[k]])) as NotifyPrefs
}

export interface Notice { title: string; body: string; url: string; tag: string }

const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t }

/** The notice for one thing. The tag groups repeats of the same item so a phone shows one, not a stack. */
export function noticeFor(kind: NotifyKind, a: { id: string; text: string; projectId?: string | null; projectName?: string | null }): Notice {
  const where = a.projectName ? clip(a.projectName, 40) : null
  if (kind === "question") {
    return { title: where ? `${where}: a question for you` : "A question for you", body: clip(a.text, 180), url: a.projectId ? `/project/${a.projectId}` : "/inbox", tag: `question-${a.id}` }
  }
  return { title: where ? `${where}: a change to judge` : "A change to judge", body: clip(a.text, 180), url: a.projectId ? `/project/${a.projectId}?tab=changes` : "/inbox", tag: `change-${a.id}` }
}
