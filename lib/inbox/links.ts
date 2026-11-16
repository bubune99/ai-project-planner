/**
 * What a question in the owner's inbox links to, so he can gather context without hunting (walk 2026-11-16: the
 * project tag, the card and any page or address named in a question were plain text). Pure; checked in links.assert.ts.
 */
export interface QuestionRefs { projectId: string | null; stepId: string | null }
export type Part = { text: string } | { text: string; href: string; external: boolean }

export function questionHrefs(q: QuestionRefs): { project: string | null; card: string | null } {
  const project = q.projectId ? `/project/${q.projectId}` : null
  return { project, card: project && q.stepId ? `${project}?tab=tasks&step=${q.stepId}` : null }
}

// A web address, or an address inside the planner written as a path (/project/..., /inbox).
const LINK = /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])|((?<![\w/])\/(?:project|inbox|todos|ideas|sops|library|dashboard|agents|chat)(?:\/[^\s<>()"'.,;:!?]*)?(?:\?[^\s<>()"']*[^\s<>()"'.,;:!?])?)/g

/** Splits text into plain runs and links. Tokens like [step:id] used by agents are dropped from what is shown. */
export function linkParts(text: string): Part[] {
  const clean = text.replace(/\[[a-z-]+:[^\]]+\]/g, "").replace(/[ \t]{2,}/g, " ")
  const parts: Part[] = []
  let at = 0
  for (const m of clean.matchAll(LINK)) {
    const i = m.index ?? 0
    if (i > at) parts.push({ text: clean.slice(at, i) })
    parts.push({ text: m[0], href: m[0], external: !!m[1] })
    at = i + m[0].length
  }
  if (at < clean.length) parts.push({ text: clean.slice(at) })
  return parts
}
