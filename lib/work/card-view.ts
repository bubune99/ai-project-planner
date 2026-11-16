/**
 * What a card shows when it is opened.
 *
 * Owner, 2026-11-16: "if i click a card, i want to see an expanded UI or modal that shows me more information,
 * especially if there are subtasks. Hover is cool but opening up for grander details with context and even images if
 * necessary makes this much better".
 *
 * Pure; checked in card-view.assert.ts.
 */

export interface Picture { url: string; caption: string }

const IMG_MD = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
const safeUrl = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null)

/** Pictures kept on the card (metadata.pictures) and pictures written into its description, each once. */
export function cardPictures(metadata: Record<string, unknown> | null | undefined, description: string | null | undefined): Picture[] {
  const out: Picture[] = []
  const seen = new Set<string>()
  const add = (url: string | null, caption: string) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push({ url, caption: caption.trim() })
  }
  const kept = metadata && Array.isArray(metadata.pictures) ? metadata.pictures : []
  for (const p of kept) {
    if (typeof p === "string") add(safeUrl(p), "")
    else if (p && typeof p === "object") add(safeUrl((p as Picture).url), String((p as Picture).caption ?? ""))
  }
  for (const m of (description ?? "").matchAll(IMG_MD)) add(safeUrl(m[2]), m[1])
  return out
}

/** The description without its pictures (they are shown in the pictures row, larger). */
export function withoutPictures(description: string | null | undefined): string {
  return (description ?? "").replace(IMG_MD, "").replace(/\n{3,}/g, "\n\n").trim()
}

/** The card's pictures after adding one, keeping the rest of its metadata. */
export function addPicture(metadata: Record<string, unknown> | null | undefined, pic: Picture): Record<string, unknown> {
  const kept = cardPictures(metadata, "")
  if (!safeUrl(pic.url) || kept.some((p) => p.url === pic.url)) return { ...(metadata ?? {}), pictures: kept }
  return { ...(metadata ?? {}), pictures: [...kept, { url: pic.url, caption: pic.caption.trim() }] }
}

export function removePicture(metadata: Record<string, unknown> | null | undefined, url: string): Record<string, unknown> {
  return { ...(metadata ?? {}), pictures: cardPictures(metadata, "").filter((p) => p.url !== url) }
}

export interface ProposalParts { goal: string; what: string; deliverable: string; proof: string; why: string; useCase?: string }

/** A proposal's parts, when the card was filed as one, in the order the owner reads them to decide. */
export function proposalParts(metadata: Record<string, unknown> | null | undefined): { label: string; text: string }[] {
  const p = metadata && typeof metadata.proposal === "object" && metadata.proposal ? (metadata.proposal as Partial<ProposalParts>) : null
  if (!p) return []
  const parts: [string, unknown][] = [
    ["The goal it serves", p.useCase ? `${p.goal} (use case: ${p.useCase})` : p.goal],
    ["What it does", p.what],
    ["What is delivered", p.deliverable],
    ["How it is proved", p.proof],
    ["Why", p.why],
  ]
  return parts.filter(([, t]) => typeof t === "string" && t.trim()).map(([label, t]) => ({ label, text: String(t).trim() }))
}

export interface TreeStep { id: string; title: string; status: string; parent_task_id?: string | null; progress?: number | null; deleted_at?: string | null }
export interface TreeRow { step: TreeStep; depth: number; done: number; total: number }

/** The card's tasks and their own steps, two levels deep, each with how many of its own are done. */
export function stepTree(rootId: string, all: TreeStep[], isDone: (status: string) => boolean): TreeRow[] {
  const kids = (id: string) => all.filter((s) => s.parent_task_id === id && !s.deleted_at)
  const rows: TreeRow[] = []
  const walk = (id: string, depth: number) => {
    for (const s of kids(id)) {
      const own = kids(s.id)
      rows.push({ step: s, depth, done: own.filter((k) => isDone(k.status)).length, total: own.length })
      if (depth < 1) walk(s.id, depth + 1)
    }
  }
  walk(rootId, 0)
  return rows
}

/** How far along the card is: its steps when it has them, otherwise its own progress. */
export function overall(rows: TreeRow[], ownProgress: number | null | undefined, isDone: (status: string) => boolean): { done: number; total: number; percent: number } {
  const top = rows.filter((r) => r.depth === 0)
  if (!top.length) return { done: 0, total: 0, percent: Math.max(0, Math.min(100, Math.round(ownProgress ?? 0))) }
  const done = top.filter((r) => isDone(r.step.status)).length
  return { done, total: top.length, percent: Math.round((done / top.length) * 100) }
}

const KIND: Record<string, string> = { initiative: "Initiative", upkeep: "Upkeep", task: "Task" }
export const kindLabel = (k: string | null | undefined) => KIND[k ?? "task"] ?? "Task"
