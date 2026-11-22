/*
  Changing a project's phases (card 2dd7fa3a).

  A phase is not a row anywhere. The Overview's strip (phase-strip.ts) works the phases out from the project's cards:
  a card's `phase` holds the phase's number, and the phase takes its name from its heading card, titled
  "Phase 3 — Dashboard Completion". So every change here is a change to cards, sent through the routes that already
  own card writes (POST /api/projects/:id/steps, PATCH and DELETE /api/projects/:id/steps/:stepId):

    add      a heading card is made in the new phase; later phases move down one
    rename   the heading card is retitled (made, if the phase had none)
    move     the cards of every phase that changes place get the new number
    remove   no card is deleted: the phase's cards leave it and are counted as "not in a phase"; the heading card
             keeps the phase's name without its number
    undo     the opposite writes, last first; a heading card the change made is deleted

  Phases carry no dates of their own (a card has start and end dates; a phase does not), so there is nothing to edit
  there. Whether a phase is done, active or upcoming is read from its cards and is never typed.

  Pure: no React, no DOM, no clock. Every edit returns a new list.
*/
import { HEADING } from "./phase-strip"

export type PhaseCard = { id: string; title?: string | null; phase?: string | null }

/** A phase as the editor holds it. `key` stays the same through an edit, so a plan can tell what moved. */
export type EditPhase = { key: string; number: number; name: string; headingId: string | null; cardIds: string[] }

export type Edited = { ok: true; phases: EditPhase[] } | { ok: false; error: string }

export type PhaseWrite =
  | { kind: "patch"; id: string; phase?: string; title?: string }
  | { kind: "create"; key: string; title: string; phase: string }
  | { kind: "delete"; id: string }

export const NAME_MAX = 80
const NEW_KEY = "new"

const isNumber = (v: unknown) => /^\d+$/.test(String(v ?? "").trim())
const tidy = (name: string) => String(name ?? "").replace(/\s+/g, " ").trim()
const same = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase()

export const headingTitle = (number: number, name: string) => `Phase ${number} — ${tidy(name)}`
export const phaseLabel = (p: Pick<EditPhase, "number" | "name">) => p.name || `Phase ${p.number}`

/**
 * What a card outside any phase holds. `phase` is required and the update route cannot empty it, so a card leaving a
 * phase gets what the create route gives a card made with no phase: the project's current phase, else "planning".
 */
export function outsidePhaseFor(currentPhase: string | null | undefined): string {
  const v = String(currentPhase ?? "").trim()
  return v && !isNumber(v) ? v : "planning"
}

/** The phases as the strip shows them, in the same order, with the cards each one holds. */
export function readPhases(cards: PhaseCard[]): EditPhase[] {
  const groups = new Map<number, PhaseCard[]>()
  for (const c of cards || []) {
    if (!c || !isNumber(c.phase)) continue
    const n = Number(String(c.phase).trim())
    groups.set(n, [...(groups.get(n) || []), c])
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([number, list]) => {
    const heading = list.find((c) => { const m = HEADING.exec(String(c.title || "")); return !!m && Number(m[1]) === number })
    const m = heading ? HEADING.exec(String(heading.title || "")) : null
    return { key: String(number), number, name: m ? tidy(m[2]) : "", headingId: heading ? heading.id : null, cardIds: list.map((c) => c.id) }
  })
}

/** Why a name cannot be used, or null. `exceptKey` is the phase being renamed. */
export function checkName(phases: EditPhase[], name: string, exceptKey?: string): string | null {
  const v = tidy(name)
  if (!v) return "Give the phase a name"
  if (v.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters or fewer`
  const clash = phases.find((p) => p.key !== exceptKey && same(phaseLabel(p), v))
  if (clash) return `Phase ${clash.number} is already called "${phaseLabel(clash)}"`
  return null
}

const renumber = (phases: EditPhase[]): EditPhase[] => phases.map((p, i) => ({ ...p, number: i + 1 }))
const wholeIndex = (at: number, max: number) => Number.isInteger(at) && at >= 0 && at <= max

/** Adds a phase at the end, or before the phase now at index `at` (0 puts it first). */
export function addPhase(phases: EditPhase[], name: string, at: number = phases.length): Edited {
  const error = checkName(phases, name)
  if (error) return { ok: false, error }
  if (!wholeIndex(at, phases.length)) return { ok: false, error: "That place is not in the list of phases" }
  const made: EditPhase = { key: NEW_KEY, number: 0, name: tidy(name), headingId: null, cardIds: [] }
  return { ok: true, phases: renumber([...phases.slice(0, at), made, ...phases.slice(at)]) }
}

export function renamePhase(phases: EditPhase[], key: string, name: string): Edited {
  if (!phases.some((p) => p.key === key)) return { ok: false, error: "That phase is no longer there" }
  const error = checkName(phases, name, key)
  if (error) return { ok: false, error }
  return { ok: true, phases: phases.map((p) => (p.key === key ? { ...p, name: tidy(name) } : p)) }
}

/** Moves a phase to index `to` of the list (0 is first). */
export function movePhase(phases: EditPhase[], key: string, to: number): Edited {
  const from = phases.findIndex((p) => p.key === key)
  if (from < 0) return { ok: false, error: "That phase is no longer there" }
  if (!wholeIndex(to, phases.length - 1)) return { ok: false, error: "That place is not in the list of phases" }
  const rest = phases.filter((p) => p.key !== key)
  return { ok: true, phases: renumber([...rest.slice(0, to), phases[from], ...rest.slice(to)]) }
}

/** Takes a phase out of the list. Its cards are kept: planWrites puts them outside any phase. */
export function removePhase(phases: EditPhase[], key: string): Edited {
  if (!phases.some((p) => p.key === key)) return { ok: false, error: "That phase is no longer there" }
  return { ok: true, phases: renumber(phases.filter((p) => p.key !== key)) }
}

/**
 * The card writes that turn `before` into `after`. Patches first, then the cards to make, so a new heading card
 * never lands in a number another phase still holds. Each write names its card and the value it ends with, so a
 * save that stops part-way can be carried on from the write that failed.
 */
export function planWrites(cards: PhaseCard[], before: EditPhase[], after: EditPhase[], outsidePhase: string): PhaseWrite[] {
  const outside = String(outsidePhase ?? "").trim()
  if (!outside || isNumber(outside)) throw new Error("Cards leaving a phase need a place that is not a phase number")
  const byId = new Map(cards.map((c) => [c.id, c]))
  const patches = new Map<string, { phase?: string; title?: string }>()
  const patch = (id: string, change: { phase?: string; title?: string }) => {
    const card = byId.get(id)
    if (!card) return
    const next = { ...(patches.get(id) || {}) }
    if (change.phase !== undefined && String(card.phase ?? "").trim() !== change.phase) next.phase = change.phase
    if (change.title !== undefined && String(card.title ?? "") !== change.title) next.title = change.title
    if (next.phase !== undefined || next.title !== undefined) patches.set(id, next)
  }
  const creates: PhaseWrite[] = []

  for (const a of after) {
    const b = before.find((p) => p.key === a.key)
    if (!b) { creates.push({ kind: "create", key: a.key, title: headingTitle(a.number, a.name), phase: String(a.number) }); continue }
    const moved = a.number !== b.number
    const named = a.name !== b.name
    if (moved) for (const id of a.cardIds) patch(id, { phase: String(a.number) })
    if (a.headingId && (moved || named)) patch(a.headingId, { title: headingTitle(a.number, a.name) })
    if (!a.headingId && named && a.name) creates.push({ kind: "create", key: a.key, title: headingTitle(a.number, a.name), phase: String(a.number) })
  }
  for (const b of before) {
    if (after.some((p) => p.key === b.key)) continue
    for (const id of b.cardIds) patch(id, { phase: outside })
    if (b.headingId && b.name) patch(b.headingId, { title: b.name })
  }
  return [...[...patches.entries()].map(([id, change]): PhaseWrite => ({ kind: "patch", id, ...change })), ...creates]
}

/**
 * The writes that take a change back, last first. `cards` are the cards as they were before the change; `made` maps
 * a created phase's key to the id its heading card was given. Only cards the change touched are written.
 */
export function invertWrites(writes: PhaseWrite[], cards: PhaseCard[], made: Record<string, string> = {}): PhaseWrite[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const back: PhaseWrite[] = []
  for (const w of [...writes].reverse()) {
    if (w.kind === "create") { if (made[w.key]) back.push({ kind: "delete", id: made[w.key] }); continue }
    if (w.kind !== "patch") continue
    const was = byId.get(w.id)
    if (!was) continue
    back.push({
      kind: "patch", id: w.id,
      ...(w.phase !== undefined ? { phase: String(was.phase ?? "") } : {}),
      ...(w.title !== undefined ? { title: String(was.title ?? "") } : {}),
    })
  }
  return back
}
