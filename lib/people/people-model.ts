/**
 * People and flows: who a product is for, what they come to do, and whether
 * each step of that has been proved to work.
 *
 * A person is who signs in (or acts). A persona is a way of using it: the same
 * person, with different habits, starts and stops in different places. A use
 * case is a journey in steps. A step points at the control on the page that
 * does it, so the step's state is read from the Checks record, never typed in.
 * An area is a part of a page, compared across personas.
 *
 * Pure: no React, no database, no clock. Checked by people-model.assert.ts.
 */
import { CONTENT_KINDS, allChecks, checkState, type Checklist, type Control, type Result, type View } from "../gates/gate-model"

/** A control named by what it is, so the link survives a rescan that renumbers the page. */
export interface ControlRef { route: string; view: string; kind: string; label: string }

export interface Person {
  id: string; name: string
  background: string; wants: string; context: string; frustrations: string; may: string; mayNot: string
  /** Where this description comes from: the page, the owner's words, research. */
  basis: string
}
export interface Persona {
  id: string; who: string; name: string; habit: string; cares: string
  /** Per use case: the step this persona starts at and the one they usually stop at (0-based, inclusive). */
  at: Record<string, [number, number]>
}
export interface Step {
  id: string; does: string; expects: string; data: string; ref?: ControlRef | null; note?: string; ways?: Way[]
  /** When what the step does, expects or points at last changed. Kept by the server (step-stamp.ts); a walk before it is owed again. */
  changedAt?: string
}
/**
 * One way on from a choice (owner, 2026-11-16: "a user at check out that has the cart go through or that decides to
 * end the order"). Its own steps, then it either ends the use case or rejoins the main line at the next step.
 * Ways hold no further choices. Rules for paths and drawing in lib/people/branches.ts.
 */
export interface Way { id: string; label: string; steps: Step[]; ends: boolean }
export const MAX_WAYS = 4
/**
 * `proposedBy`, `reviewed` and `sinceReview` are the owner's review of the list (owner, 2026-11-16: agents propose
 * the use cases, "but it is something that I need to review in all situations"). A use case without them was written
 * before this was recorded: it reads as proposed by the owner and reviewed. Stored only when they say otherwise.
 */
export interface UseCase {
  id: string; who: string; name: string; lens: string; steps: Step[]
  /** Who put it on the list: left out for the owner, else the agent's name. */
  proposedBy?: string
  /** Left out when the owner has reviewed it; false while it waits for him. */
  reviewed?: boolean
  /** What agents changed in its goal or steps since he last reviewed it, oldest first. */
  sinceReview?: string[]
}
export interface Area { id: string; route: string; name: string; ref?: ControlRef | null; does: Record<string, string> }
export interface FlowDoc { people: Person[]; personas: Persona[]; flows: UseCase[]; areas: Area[] }

/** Every step of a use case, the ways' included, in reading order. */
export const everyStep = (flow: Pick<UseCase, "steps">): Step[] => flow.steps.flatMap((s) => [s, ...(s.ways ?? []).flatMap((w) => w.steps)])

export const emptyDoc = (): FlowDoc => ({ people: [], personas: [], flows: [], areas: [] })

const LIMITS = { people: 20, personas: 40, flows: 80, steps: 40, areas: 80, text: 600, name: 60, since: 8 }
const PERSON_TEXT = ["name", "background", "wants", "context", "frustrations", "may", "mayNot", "basis"] as const

/**
 * Reads a document sent by a browser or an agent: keeps the known fields, trims
 * the text, and says what is wrong. An empty `errors` means it can be saved.
 */
export function parseDoc(raw: unknown): { doc: FlowDoc; errors: string[] } {
  const errors: string[] = []
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const arr = (v: unknown, what: keyof typeof LIMITS): unknown[] => {
    if (v !== undefined && !Array.isArray(v)) errors.push(`${what} must be a list`)
    const a = Array.isArray(v) ? v : []
    if (a.length > LIMITS[what]) errors.push(`Too many ${what}: ${a.length}, the most is ${LIMITS[what]}`)
    return a.slice(0, LIMITS[what])
  }
  const text = (v: unknown, where: string, required = false): string => {
    const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
    if (required && !s) errors.push(`${where} is empty`)
    if (s.length > LIMITS.text) errors.push(`${where} is longer than ${LIMITS.text} characters`)
    return s.slice(0, LIMITS.text)
  }
  const id = (v: unknown, where: string, seen: Set<string>): string => {
    const s = typeof v === "string" ? v.trim() : ""
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(s)) errors.push(`${where} needs an id of letters, digits, - or _`)
    else if (seen.has(s)) errors.push(`${where}: the id "${s}" is used twice`)
    seen.add(s)
    return s
  }
  const ref = (v: unknown, where: string): ControlRef | null => {
    if (v === null || v === undefined) return null
    const r = obj(v), out = { route: text(r.route, `${where} route`), view: text(r.view, `${where} view`), kind: text(r.kind, `${where} kind`), label: text(r.label, `${where} label`) }
    if (!out.route.startsWith("/") || !out.view || !out.label) { errors.push(`${where}: a control needs a route starting with /, a view and a label`); return null }
    return out
  }
  const d = obj(raw)

  const pIds = new Set<string>()
  const people = arr(d.people, "people").map((p, i) => {
    const o = obj(p), where = `Person ${i + 1}`
    const out = { id: id(o.id, where, pIds) } as Person
    for (const k of PERSON_TEXT) out[k] = text(o[k], `${where} ${k}`, k === "name")
    return out
  })

  const fIds = new Set<string>()
  const flows = arr(d.flows, "flows").map((f, i) => {
    const o = obj(f), where = `Use case ${i + 1}`, sIds = new Set<string>()
    // A step on the main line or in a way: the same fields, ids unique across the whole use case. Never a nested choice.
    const readStep = (s: unknown, sw: string): Step => {
      const so = obj(s)
      const step: Step = { id: id(so.id, sw, sIds), does: text(so.does, `${sw} "does"`, true), expects: text(so.expects, `${sw} "expects"`), data: text(so.data, `${sw} "content"`), ref: ref(so.ref, sw) }
      const note = text(so.note, `${sw} note`)
      const changedAt = typeof so.changedAt === "string" && !Number.isNaN(Date.parse(so.changedAt)) ? new Date(so.changedAt).toISOString() : undefined
      return { ...step, ...(note ? { note } : {}), ...(changedAt ? { changedAt } : {}) }
    }
    const who = typeof o.who === "string" ? o.who : ""
    if (!pIds.has(who)) errors.push(`${where} belongs to a person who is not in the list`)
    const proposedBy = text(o.proposedBy, `${where} "proposed by"`).slice(0, LIMITS.name)
    if (o.reviewed !== undefined && typeof o.reviewed !== "boolean") errors.push(`${where}: "reviewed" must be true or false`)
    const since = (Array.isArray(o.sinceReview) ? o.sinceReview : []).map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, LIMITS.text) : "")).filter(Boolean).slice(-LIMITS.since)
    return {
      id: id(o.id, where, fIds), who, name: text(o.name, `${where} name`, true), lens: text(o.lens, `${where} lens`),
      ...(proposedBy ? { proposedBy } : {}), ...(typeof o.reviewed === "boolean" ? { reviewed: o.reviewed } : {}), ...(since.length ? { sinceReview: since } : {}),
      steps: arr(o.steps, "steps").map((s, k) => {
        const sw = `${where}, step ${k + 1}`, step = readStep(s, sw)
        if (obj(s).ways === undefined) return step
        if (!Array.isArray(obj(s).ways)) { errors.push(`${sw}: its ways must be a list`); return step }
        const raw = obj(s).ways as unknown[]
        if (raw.length > MAX_WAYS) errors.push(`${sw}: a choice has at most ${MAX_WAYS} ways`)
        if (raw.length === 0) return step
        if (raw.length === 1) errors.push(`${sw}: a choice needs at least two ways`)
        const wIds = new Set<string>()
        const ways: Way[] = raw.slice(0, MAX_WAYS).map((w, j) => {
          const wo = obj(w), ww = `${sw}, way ${j + 1}`
          return { id: id(wo.id, ww, wIds), label: text(wo.label, `${ww} name`, true), ends: wo.ends === true, steps: arr(wo.steps, "steps").map((x, m) => readStep(x, `${ww}, step ${m + 1}`)) }
        })
        return { ...step, ways }
      }),
    }
  })

  const qIds = new Set<string>()
  const personas = arr(d.personas, "personas").map((q, i) => {
    const o = obj(q), where = `Persona ${i + 1}`
    const who = typeof o.who === "string" ? o.who : ""
    if (!pIds.has(who)) errors.push(`${where} belongs to a person who is not in the list`)
    const at: Persona["at"] = {}
    for (const [flowId, span] of Object.entries(obj(o.at))) {
      const flow = flows.find((f) => f.id === flowId)
      if (!flow) continue // the use case was removed: the span goes with it
      const [a, b] = Array.isArray(span) ? span : []
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a) { errors.push(`${where}: where they start and stop in "${flow.name}" must be two step numbers in order`); continue }
      if (flow.steps.length) at[flowId] = [Math.min(a, flow.steps.length - 1), Math.min(b, flow.steps.length - 1)]
    }
    return { id: id(o.id, where, qIds), who, name: text(o.name, `${where} name`, true), habit: text(o.habit, `${where} habit`), cares: text(o.cares, `${where} cares`), at }
  })

  const aIds = new Set<string>()
  const areas = arr(d.areas, "areas").map((a, i) => {
    const o = obj(a), where = `Page part ${i + 1}`
    const route = text(o.route, `${where} route`)
    if (!route.startsWith("/")) errors.push(`${where} needs the page's route`)
    const does: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj(o.does))) if (qIds.has(k)) { const t = text(v, `${where} for ${k}`); if (t) does[k] = t }
    return { id: id(o.id, where, aIds), route, name: text(o.name, `${where} name`, true), ref: ref(o.ref, where), does }
  })

  return { doc: { people, personas, flows, areas }, errors }
}

// ---- reading a step's state from the Checks record ----

export interface PageRecord { list: Checklist; results: Result[] }
export type StepState = "unbuilt" | "missing" | "pending" | "flagged" | "failed" | "passed"

export const STEP_WORD: Record<StepState, string> = {
  unbuilt: "Nothing on the page does this yet",
  missing: "Not found in the latest scan",
  pending: "Not checked yet",
  flagged: "Flagged, being checked",
  failed: "Failing, being fixed",
  passed: "Verified",
}

export const refOf = (route: string, view: View, c: Control): ControlRef => ({ route, view: view.key, kind: c.kind, label: c.label })
export const sameRef = (a: ControlRef | null | undefined, b: ControlRef | null | undefined) => !!a && !!b && a.route === b.route && a.view === b.view && a.kind === b.kind && a.label === b.label

/** The control a link points at in the page's current checklist: the same view, kind and label, else the same kind and label anywhere on it. */
export function findControl(list: Checklist | null | undefined, ref: ControlRef | null | undefined): { view: View; control: Control } | null {
  if (!list || !ref) return null
  for (const view of list.views) if (view.key === ref.view) for (const control of view.controls) if (control.kind === ref.kind && control.label === ref.label) return { view, control }
  for (const view of list.views) for (const control of view.controls) if (control.kind === ref.kind && control.label === ref.label) return { view, control }
  return null
}

/** Where a control stands, across all of its checks: one failure fails it, one open claim flags it, and it is verified only when every check has cleared. */
export function controlState(page: PageRecord, n: number): Exclude<StepState, "unbuilt" | "missing"> {
  const states = allChecks(page.list, page.results).filter((c) => c.n === n).map((c) => checkState(page.results, c.key))
  if (states.some((s) => s === "failed" || s === "disputed")) return "failed"
  if (states.some((s) => s === "flagged")) return "flagged"
  if (states.length && states.every((s) => s === "passed" || s === "waived")) return "passed"
  return "pending"
}

export function stepState(pages: Record<string, PageRecord | undefined>, step: Step): StepState {
  if (!step.ref) return "unbuilt"
  const page = pages[step.ref.route], hit = page && findControl(page.list, step.ref)
  if (!page || !hit) return "missing"
  return controlState(page, hit.control.n)
}

export interface FlowScore { n: number; ok: number; bad: number; open: number; gap: number }
/** A use case in numbers: steps verified, failing, still being checked, and with nothing behind them. */
export function scoreFlow(pages: Record<string, PageRecord | undefined>, flow: UseCase): FlowScore {
  const st = everyStep(flow).map((s) => stepState(pages, s))
  return { n: st.length, ok: st.filter((x) => x === "passed").length, bad: st.filter((x) => x === "failed").length, open: st.filter((x) => x === "flagged" || x === "pending").length, gap: st.filter((x) => x === "unbuilt" || x === "missing").length }
}

/** Controls on a page that no use case reaches. Each is part of a journey nobody wrote down, or something nobody needs. */
export function orphans(route: string, list: Checklist, doc: FlowDoc): { view: View; control: Control }[] {
  const used = new Set<number>()
  for (const f of doc.flows) for (const s of everyStep(f)) { const hit = s.ref?.route === route ? findControl(list, s.ref) : null; if (hit) used.add(hit.control.n) }
  return list.views.flatMap((view) => view.controls.filter((c) => !CONTENT_KINDS.has(c.kind) && !used.has(c.n)).map((control) => ({ view, control })))
}

const NOT_USED = /^(skips|not used)/i, STARTS = /^starts/i
/** What a row of the page comparison says about the design: who that part of the page is for decides where it goes. */
export function areaMeaning(cells: { persona: string; text: string }[]): string {
  const starts = cells.filter((c) => STARTS.test(c.text)).map((c) => c.persona)
  const users = cells.filter((c) => c.text && !NOT_USED.test(c.text)).length
  if (starts.length) return `${starts.join(" and ")} begin${starts.length === 1 ? "s" : ""} here: it must be seen without scrolling.`
  if (users === 0) return "Nobody uses it. Why is it here?"
  if (users === 1) return "One kind of user only. It can sit lower."
  return "Shared by several. Keep it steady."
}
export const cellKind = (text: string): "start" | "off" | "" => (STARTS.test(text) ? "start" : !text || NOT_USED.test(text) ? "off" : "")

// ---- the record of what changed ----

/** What changed between two versions, in plain sentences, for the record. Empty means nothing did. */
export function describeChanges(before: FlowDoc, after: FlowDoc): string[] {
  const out: string[] = []
  const byId = <T extends { id: string }>(a: T[]) => new Map(a.map((x) => [x.id, x]))
  const group = <T extends { id: string; name: string }>(what: string, a: T[], b: T[], fields: (keyof T)[], more?: (x: T, y: T) => void) => {
    const A = byId(a), B = byId(b)
    for (const y of b) if (!A.has(y.id)) out.push(`Added ${what} "${y.name}"`)
    for (const x of a) if (!B.has(x.id)) out.push(`Removed ${what} "${x.name}"`)
    for (const y of b) {
      const x = A.get(y.id)
      if (!x) continue
      const changed = fields.filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]))
      if (changed.includes("name" as keyof T)) out.push(`Renamed ${what} "${x.name}" to "${y.name}"`)
      const rest = changed.filter((k) => k !== "name")
      if (rest.length) out.push(`Changed ${rest.map((k) => FIELD_WORD[String(k)] ?? String(k)).join(", ")} of ${what} "${y.name}"`)
      more?.(x, y)
    }
  }
  group("person", before.people, after.people, [...PERSON_TEXT])
  group("persona", before.personas, after.personas, ["name", "habit", "cares", "at", "who"])
  group("use case", before.flows, after.flows, ["name", "lens", "who"], (x, y) => {
    for (const c of stepChanges(x, y)) out.push(`Use case "${y.name}": ${c.line}`)
    if (isReviewed(x) !== isReviewed(y)) out.push(isReviewed(y) ? `Marked use case "${y.name}" reviewed` : `Use case "${y.name}" is back to not reviewed`)
  })
  const had = new Set(before.flows.map((f) => f.id))
  for (const y of after.flows) if (!had.has(y.id) && !isReviewed(y)) out.push(`Use case "${y.name}" waits for the owner's review (proposed by ${proposedByOf(y)})`)
  group("page part", before.areas, after.areas, ["name", "does", "ref", "route"])
  return out
}
/** What changed in a use case's steps, each as the end of a sentence. `link` marks a change to what a step points at only. */
function stepChanges(x: Pick<UseCase, "steps">, y: Pick<UseCase, "steps">): { line: string; link: boolean }[] {
  const out: { line: string; link: boolean }[] = []
  const said = (line: string, link = false) => out.push({ line, link })
  const byId = (a: Step[]) => new Map(a.map((s) => [s.id, s]))
  const A = byId(everyStep(x)), B = byId(everyStep(y))
  for (const s of y.steps) {
    const was = (A.get(s.id)?.ways ?? []).map((w) => `${w.label}${w.ends ? " (ends)" : ""}`).join(", "), now = (s.ways ?? []).map((w) => `${w.label}${w.ends ? " (ends)" : ""}`).join(", ")
    if (A.has(s.id) && was !== now) said(now ? `"${s.does}" is now a choice: ${now}` : `"${s.does}" is no longer a choice`)
  }
  for (const s of everyStep(y)) if (!A.has(s.id)) said(`added the step "${s.does}"`)
  for (const s of everyStep(x)) if (!B.has(s.id)) said(`removed the step "${s.does}"`)
  for (const s of everyStep(y)) {
    const p = A.get(s.id)
    if (!p) continue
    const ch = (["does", "expects", "data", "note"] as const).filter((k) => (p[k] ?? "") !== (s[k] ?? ""))
    if (ch.length) said(`reworded the step "${s.does}"`)
    if (!sameRef(p.ref, s.ref) && (p.ref || s.ref)) said(`the step "${s.does}" ${s.ref ? `now points at "${s.ref.label}"` : "no longer points at anything on the page"}`, true)
  }
  const kept = (ids: string[], other: Map<string, Step>) => ids.filter((i) => other.has(i)).join(" ")
  if (kept(x.steps.map((s) => s.id), B) !== kept(y.steps.map((s) => s.id), A)) said("the steps were put in a different order")
  return out
}
const FIELD_WORD: Record<string, string> = {
  background: "who they are", wants: "what they want", context: "when and where they use it", frustrations: "what gets in their way", may: "what they may do", mayNot: "what they may not",
  basis: "where it comes from", habit: "the habit", cares: "what they care about", at: "where they start and stop", who: "who it belongs to", lens: "why they do it", does: "who uses it and how", ref: "what it points at", route: "the page",
}

// ---- who proposed a use case, and whether the owner has reviewed it ----

export const OWNER = "owner"
/** What an agent is called when it gave no name. */
export const UNNAMED_AGENT = "an agent"
const isOwnerName = (s: string | undefined) => !s || s.trim().toLowerCase() === OWNER
export const proposedByOf = (f: Pick<UseCase, "proposedBy">): string => (isOwnerName(f.proposedBy) ? OWNER : f.proposedBy!)
export const isReviewed = (f: Pick<UseCase, "reviewed">): boolean => f.reviewed !== false
/** The use cases the owner has not reviewed yet, in the order they are listed. */
export const waitingForReview = (doc: Pick<FlowDoc, "flows">): UseCase[] => doc.flows.filter((f) => !isReviewed(f))

/** A use case with its review fields written the one way they are stored: only what differs from "the owner's, reviewed". */
function withReview(f: UseCase, proposedBy: string, reviewed: boolean, since: string[]): UseCase {
  const { proposedBy: _p, reviewed: _r, sinceReview: _s, ...rest } = f
  return { ...rest, ...(isOwnerName(proposedBy) ? {} : { proposedBy }), ...(reviewed ? {} : { reviewed: false, ...(since.length ? { sinceReview: since.slice(-LIMITS.since) } : {}) }) }
}

/**
 * What changed in a use case's goal or steps, each as the end of a sentence ("reworded the step ..."). Pointing a step
 * at a control on the page is not one: it says what does the step, not what the step is.
 */
export function goalOrStepChanges(x: UseCase, y: UseCase): string[] {
  const out: string[] = []
  if (x.name !== y.name) out.push(`renamed it from "${x.name}" to "${y.name}"`)
  if (x.lens !== y.lens) out.push("changed why they do it")
  if (x.who !== y.who) out.push("gave it to another person")
  return [...out, ...stepChanges(x, y).filter((c) => !c.link).map((c) => c.line)]
}

/** The owner's own edit: a new document with one use case marked reviewed (which clears what changed) or not. */
export function markReviewed(doc: FlowDoc, flowId: string, reviewed: boolean): FlowDoc {
  if (!doc.flows.some((f) => f.id === flowId)) return doc
  return { ...doc, flows: doc.flows.map((f) => (f.id === flowId ? withReview(f, proposedByOf(f), reviewed, []) : f)) }
}

/**
 * What an agent's save may not do to the review, in words; empty means it can be saved. Only the owner, in a signed-in
 * browser session, marks a use case reviewed or puts it back, and who proposed one is a record, not a field to edit.
 * Sending a use case back as it was read, or without these fields, is never refused: settleReview fills them in.
 */
export function reviewRefusals(before: FlowDoc, sent: FlowDoc): string[] {
  const out: string[] = []
  const was = new Map(before.flows.map((f) => [f.id, f]))
  for (const y of sent.flows) {
    const x = was.get(y.id), where = `Use case "${y.name}"`
    if (!x) {
      if (y.proposedBy && isOwnerName(y.proposedBy)) out.push(`${where}: an agent cannot record a use case as proposed by the owner. Leave "proposedBy" out or give the agent's name`)
      if (y.reviewed === true) out.push(`${where}: only the owner, signed in, can mark a use case reviewed. A use case an agent adds waits for his review`)
      continue
    }
    if (y.proposedBy && proposedByOf(y) !== proposedByOf(x)) out.push(`${where}: who proposed a use case is not changed after it is listed (it was ${proposedByOf(x) === OWNER ? "the owner" : proposedByOf(x)})`)
    const changed = goalOrStepChanges(x, y).length > 0
    if (y.reviewed === true && (!isReviewed(x) || changed)) out.push(`${where}: only the owner, signed in, can mark a use case reviewed${changed && isReviewed(x) ? `. An agent's change to its goal or steps puts it back to not reviewed; leave "reviewed" out` : ""}`)
    if (y.reviewed === false && isReviewed(x) && !changed) out.push(`${where}: only the owner, signed in, can put a reviewed use case back to not reviewed`)
  }
  return out
}

/**
 * The document as it is stored after a save, with the review settled. The owner's save is kept as he sent it. An
 * agent's save keeps who proposed each use case, lists a new one under the agent's name as waiting for review, and puts
 * a reviewed one back to not reviewed when its goal or steps changed, keeping what changed. Call reviewRefusals first.
 */
export function settleReview(before: FlowDoc, sent: FlowDoc, by: { actor: "owner" | "agent"; name?: string }): FlowDoc {
  if (by.actor === "owner") return { ...sent, flows: sent.flows.map((y) => withReview(y, proposedByOf(y), isReviewed(y), y.sinceReview ?? [])) }
  const given = (by.name ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.name), name = isOwnerName(given) ? UNNAMED_AGENT : given
  const Name = name.charAt(0).toUpperCase() + name.slice(1)
  const was = new Map(before.flows.map((f) => [f.id, f]))
  return { ...sent, flows: sent.flows.map((y) => {
    const x = was.get(y.id)
    if (!x) return withReview(y, isOwnerName(y.proposedBy) ? name : y.proposedBy!, false, [])
    const changed = goalOrStepChanges(x, y), reviewed = isReviewed(x) && !changed.length
    // What changed is kept only for a use case he had reviewed; one he has never reviewed is new to him as a whole.
    const since = isReviewed(x) || x.sinceReview?.length ? [...(x.sinceReview ?? []), ...changed.map((c) => `${Name} ${c}`)] : []
    return withReview(y, proposedByOf(x), reviewed, since)
  }) }
}

/**
 * Where a persona starts and stops, after a step is taken out of (or put into) a use case at `index`. The span keeps
 * pointing at the same steps; it is dropped only when every step in it is gone.
 */
export function shiftSpan(span: [number, number], index: number, change: "removed" | "inserted"): [number, number] | null {
  const [a, b] = span
  if (change === "inserted") return [index <= a ? a + 1 : a, index <= b ? b + 1 : b]
  const next: [number, number] = [index < a ? a - 1 : a, index <= b ? b - 1 : b]
  return next[1] < next[0] ? null : next
}
/** Applies shiftSpan to every persona's span in one use case. Changes the personas it is given. */
export function shiftSpans(personas: Persona[], flowId: string, index: number, change: "removed" | "inserted"): void {
  for (const q of personas) {
    const cur = q.at[flowId]
    if (!cur) continue
    const next = shiftSpan(cur, index, change)
    if (next) q.at[flowId] = next
    else delete q.at[flowId]
  }
}

/** A short id that is not already taken. `seed` makes it repeatable in tests. */
export function freshId(prefix: string, taken: Iterable<string>, seed: number): string {
  const used = new Set(taken)
  for (let i = seed; ; i++) { const id = `${prefix}${i.toString(36)}`; if (!used.has(id)) return id }
}
