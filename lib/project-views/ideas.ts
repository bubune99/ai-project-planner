/**
 * Reads the plan already written into an idea's description: numbered
 * feature layers ("1. HOUSE DESIGNS: ..."), their "- needs" lists, and a
 * "Suggested order" list. Pure; checked by ideas.assert.ts.
 *
 * This is a reader for what exists today. Features stored as their own
 * records would replace it; until then nothing here is invented, an idea
 * without numbered layers simply has no features.
 */

export interface IdeaFeature { name: string; summary: string; needs: string[] }
export interface IdeaPlan { intro: string; features: IdeaFeature[]; order: string[] }

const ACRONYMS = /\b(cms|ai|seo|api|ui|ux|mcp|crm|pdf|sms)\b/gi

export function featureName(raw: string): string {
  const t = raw.trim().toLowerCase()
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(ACRONYMS, (w) => w.toUpperCase())
}

export function parseIdeaPlan(description: string | null | undefined): IdeaPlan {
  const lines = String(description || "").split("\n")
  const intro: string[] = []
  const features: IdeaFeature[] = []
  const order: string[] = []
  let cur: IdeaFeature | null = null
  let inOrder = false
  const clean = (s: string) => s.trim().replace(/[;.]$/, "")
  for (const line of lines) {
    const head = /^\s*(\d+)\.\s+([A-Z][A-Z0-9 &/-]{2,}):\s*(.*)$/.exec(line)
    if (head) {
      cur = { name: featureName(head[2]), summary: head[3].trim(), needs: [] }
      features.push(cur)
      inOrder = false
      continue
    }
    if (/^\s*suggested order\b/i.test(line)) { cur = null; inOrder = true; continue }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (inOrder) {
      if (bullet) order.push(clean(bullet[1]))
      else if (line.trim()) order.push(clean(line))
      continue
    }
    if (cur) {
      if (bullet) cur.needs.push(clean(bullet[1]))
      else if (/^\s*needs:?\s*$/i.test(line)) { /* label line */ }
      else if (line.trim()) cur.summary = `${cur.summary} ${line.trim()}`.trim()
      continue
    }
    intro.push(line)
  }
  return { intro: intro.join("\n").trim(), features, order }
}

export type IdeaStage = "idea" | "exploring" | "waiting" | "decided"
export function ideaStage(lifecycle: string | null | undefined): IdeaStage {
  if (lifecycle === "exploring" || lifecycle === "refined") return "exploring"
  if (lifecycle === "decided" || lifecycle === "promoted") return "decided"
  return "idea"
}

/** Ideas aren't linked to projects yet (only promotedToProjectId). Match by the project's first word as a stopgap, flagged in the UI. */
export function ideasForProject<T extends { title: string; promotedToProjectId?: string | null }>(ideas: T[], projectId: string, projectName: string): T[] {
  const word = (projectName || "").split(/[\s—–-]+/)[0]
  const re = word.length > 2 ? new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null
  return ideas.filter((i) => i.promotedToProjectId === projectId || (re ? re.test(i.title) : false))
}
