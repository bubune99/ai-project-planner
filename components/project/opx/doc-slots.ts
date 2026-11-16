/*
 * Which document fills which core slot of a project (Docs & files). Pure, checked in doc-slots.assert.ts.
 *
 * A document whose title is the slot's own name always fills that slot. Only then are the looser matches tried
 * (the slot's category, its words, its type). Before this, the first slot that loosely matched took the document:
 * "Design criteria" (category design) filled the Design system slot, and its own slot stayed "Not written yet".
 */

export interface Doc { id: string; title: string; content?: string | null; category?: string | null; doc_type?: string | null; updated_at?: string | null; created_at?: string | null; is_file?: boolean; file_type?: string | null; file_size?: number | null }

/** The default slots. Settings > Core documents lets a project choose its own (saved in project metadata). */
export const CORE_SLOTS: { name: string; match: RegExp; category?: string; docType?: string }[] = [
  { name: "Business plan", match: /business plan|business model|revenue model/i },
  { name: "Marketing plan", match: /marketing|go[- ]to[- ]market|launch plan/i },
  { name: "Design system", match: /design system|brand|tokens|style guide|typography/i, category: "design" },
  { name: "Design criteria", match: /criteria|principles|guidelines|preferences/i },
  { name: "Vision", match: /vision/i, category: "vision" },
  { name: "Product spec", match: /spec|prd|requirements|settings map/i, docType: "requirements" },
  { name: "Flows", match: /^flow /i, category: "flows" },
  { name: "Operations & security", match: /security|operations|runbook|audit/i, category: "security" },
]

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * chosen: the owner's own pick per slot (owner, 2026-11-16: "Fill automatically, but let me change it"). A document id
 * fills that slot whatever matches; null keeps the slot empty; a slot not in it fills itself as before. A chosen
 * document that has since been deleted falls back to the automatic match.
 */
export function fillSlots<D extends Doc>(docs: D[], names?: string[], chosen?: Record<string, string | null>): { name: string; doc: D | null; chosen: boolean }[] {
  const slots: { name: string; match: RegExp; category?: string; docType?: string }[] = names
    ? CORE_SLOTS.filter((s) => names.includes(s.name)).concat(names.filter((n) => !CORE_SLOTS.some((s) => s.name === n)).map((n) => ({ name: n, match: new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })))
    : CORE_SLOTS
  const used = new Set<string>()
  const filled = new Map<string, D>()
  const picked = new Set<string>()
  // 0. The owner's own choices.
  for (const s of slots) {
    if (!chosen || !Object.prototype.hasOwnProperty.call(chosen, s.name)) continue
    const id = chosen[s.name]
    if (id === null) { picked.add(s.name); continue }
    const d = docs.find((x) => x.id === id)
    if (d) { used.add(d.id); filled.set(s.name, d); picked.add(s.name) }
  }
  // 1. A title that is exactly the slot's name.
  for (const s of slots) {
    if (picked.has(s.name)) continue
    const d = docs.find((x) => !used.has(x.id) && same(x.title, s.name))
    if (d) { used.add(d.id); filled.set(s.name, d) }
  }
  // 2. The looser matches, for slots still empty. A document titled exactly as ANOTHER slot is never taken.
  for (const s of slots) {
    if (filled.has(s.name) || picked.has(s.name)) continue
    const d = docs.find((x) => !used.has(x.id) && !slots.some((o) => o.name !== s.name && same(x.title, o.name)) &&
      ((s.category && (x.category || "").toLowerCase() === s.category) || s.match.test(x.title) || (s.docType && x.doc_type === s.docType)))
    if (d) { used.add(d.id); filled.set(s.name, d) }
  }
  return slots.map((s) => ({ name: s.name, doc: filled.get(s.name) || null, chosen: picked.has(s.name) }))
}
