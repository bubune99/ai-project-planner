/**
 * Checks: the per-page checklist an agent must clear before it may call a
 * screen done (owner 2026-11-13). Pure functions: no database, no React, no
 * clock; callers pass `now`.
 *
 * A checklist covers one page. A page has views (the page itself, and every
 * menu, dialog or panel that opens from it). A view has controls. A control has
 * workflows, and each workflow is checked once per state. Every step of a
 * workflow carries an action check (what happens) and a visual check (what the
 * picture must show, and what must be gone from it).
 *
 * Verdicts come from three kinds of actor. The builder is the agent doing the
 * work; the reviewer is a second agent that only sees the evidence; the owner
 * settles a disagreement and may waive a check.
 */

export interface Step {
  do: string
  expect: string
  /** Must be in the picture after this step. */
  there?: string[]
  /** Must be gone from the picture after this step. */
  gone?: string[]
}

export interface Workflow {
  name: string
  /** The state to start from, in words. */
  before?: string
  steps: Step[]
}

export interface Control {
  /** Number shown on the picture. Unique in the checklist. */
  n: number
  label: string
  kind: string
  /** Position inside its view's picture, in the view's own units. */
  x: number
  y: number
  w: number
  h: number
  /** Present on every page (a top bar or menu), so one pass covers them all. */
  shared?: boolean
  states: string[]
  workflows: Workflow[]
}

export interface View {
  key: string
  name: string
  /** Size of the view's picture, in the same units as its controls. */
  w: number
  h: number
  controls: Control[]
}

export interface Checklist {
  route: string
  title?: string
  views: View[]
}

export type Actor = "builder" | "reviewer" | "owner"
export type Verdict = "passed" | "failed" | "waived"
export type CheckState = "pending" | "passed" | "failed" | "waived" | "disputed"

export interface Result {
  key: string
  actor: Actor
  status: Verdict
  note?: string
  at: string
}

export interface Issue {
  where: string
  message: string
}

export interface CheckRef {
  key: string
  view: string
  n: number
  label: string
  workflow: string
  state: string
}

const SEP = "|"

/** A check's key: control number, workflow name, state. */
export function checkKey(n: number, workflow: string, state: string): string {
  return [n, workflow, state].join(SEP)
}

/** Every check in the list, in the order they should be worked. */
export function allChecks(list: Checklist): CheckRef[] {
  const out: CheckRef[] = []
  for (const v of list.views) for (const c of v.controls) for (const w of c.workflows) for (const s of c.states) {
    out.push({ key: checkKey(c.n, w.name, s), view: v.key, n: c.n, label: c.label, workflow: w.name, state: s })
  }
  return out
}

/** What is wrong with a checklist. Empty means it can be saved. */
export function validateChecklist(list: Checklist): Issue[] {
  const issues: Issue[] = []
  const say = (where: string, message: string) => issues.push({ where, message })
  if (!list.route || !list.route.startsWith("/")) say("route", "The route must start with /")
  if (!list.views?.length) say("views", "A checklist needs at least one view")
  const viewKeys = new Set<string>(), numbers = new Set<number>()
  for (const v of list.views ?? []) {
    if (!v.key) say("view", "Every view needs a key")
    if (viewKeys.has(v.key)) say(`view ${v.key}`, "Two views share this key")
    viewKeys.add(v.key)
    if (!(v.w > 0) || !(v.h > 0)) say(`view ${v.key}`, "A view needs a width and a height")
    for (const c of v.controls ?? []) {
      const where = `control ${c.n} (${c.label})`
      if (!Number.isInteger(c.n) || c.n < 1) say(where, "The number must be a whole number from 1")
      if (numbers.has(c.n)) say(where, "Two controls share this number")
      numbers.add(c.n)
      if (!c.label?.trim()) say(`control ${c.n}`, "A control needs a label")
      if (!c.states?.length) say(where, "A control needs at least one state to be checked in")
      if (!c.workflows?.length) say(where, "A control needs at least one workflow")
      if ((c.states ?? []).some((s) => s.includes(SEP))) say(where, `A state name cannot contain ${SEP}`)
      if (new Set(c.states).size !== (c.states ?? []).length) say(where, "Two states share a name")
      const names = new Set<string>()
      for (const w of c.workflows ?? []) {
        if (!w.name?.trim()) say(where, "A workflow needs a name")
        if (w.name?.includes(SEP)) say(where, `A workflow name cannot contain ${SEP}`)
        if (names.has(w.name)) say(where, `Two workflows are named "${w.name}"`)
        names.add(w.name)
        if (!w.steps?.length) say(`${where}, ${w.name}`, "A workflow needs at least one step")
        for (const s of w.steps ?? []) if (!s.do?.trim() || !s.expect?.trim()) say(`${where}, ${w.name}`, "Every step needs what to do and what to expect")
      }
      if (c.x < 0 || c.y < 0 || c.x + c.w > v.w + 1 || c.y + c.h > v.h + 1) say(where, "The control sits outside its view's picture")
    }
  }
  return issues
}

/**
 * Where one check stands. The owner's latest word settles it. Otherwise the
 * builder's and the reviewer's latest verdicts are compared: agreeing verdicts
 * stand, differing ones are disputed, and a lone verdict stands on its own.
 * Only the owner can waive.
 */
export function checkState(results: Result[], key: string): CheckState {
  const latest = (actor: Actor) => results.filter((r) => r.key === key && r.actor === actor).sort((a, b) => b.at.localeCompare(a.at))[0]
  const owner = latest("owner")
  if (owner) return owner.status
  const b = latest("builder"), r = latest("reviewer")
  const verdict = (x?: Result): "passed" | "failed" | null => (x && x.status !== "waived" ? x.status : null)
  const vb = verdict(b), vr = verdict(r)
  if (vb && vr) return vb === vr ? vb : "disputed"
  return vb ?? vr ?? "pending"
}

/** True when a second actor has looked: a reviewer or the owner. */
export function isReviewed(results: Result[], key: string): boolean {
  return results.some((r) => r.key === key && r.actor !== "builder")
}

export interface Summary {
  total: number
  /** Passed or waived. */
  cleared: number
  passed: number
  waived: number
  failed: number
  disputed: number
  pending: number
  /** Cleared checks a reviewer or the owner has also looked at. */
  reviewed: number
  /** Nothing left to do: every check is passed or waived. */
  done: boolean
}

export function summarize(list: Checklist, results: Result[]): Summary {
  const s: Summary = { total: 0, cleared: 0, passed: 0, waived: 0, failed: 0, disputed: 0, pending: 0, reviewed: 0, done: false }
  for (const c of allChecks(list)) {
    const st = checkState(results, c.key)
    s.total++
    s[st]++
    if (st === "passed" || st === "waived") { s.cleared++; if (isReviewed(results, c.key)) s.reviewed++ }
  }
  s.done = s.total > 0 && s.cleared === s.total
  return s
}

/** The next check to work: the first that is not passed or waived. Failed and disputed ones come back before untouched ones. */
export function nextCheck(list: Checklist, results: Result[]): (CheckRef & { state_now: CheckState }) | null {
  const open = allChecks(list).map((c) => ({ ...c, state_now: checkState(results, c.key) })).filter((c) => c.state_now !== "passed" && c.state_now !== "waived")
  // A dispute waits for the owner, so the builder is sent to failures first, then untouched checks.
  return open.find((c) => c.state_now === "failed") ?? open.find((c) => c.state_now === "pending") ?? open[0] ?? null
}

/** The line a hook gives the agent after each check. */
export function hookLine(list: Checklist, results: Result[]): string {
  const s = summarize(list, results), next = nextCheck(list, results)
  if (!s.total) return `${list.route} has no checks yet.`
  if (!next) return `All ${s.total} checks on ${list.route} are cleared. You may finish; the evidence goes to the reviewer.`
  const waiting = next.state_now === "disputed" ? " It is disputed and waits for the owner." : next.state_now === "failed" ? " It failed last time: fix it, then check it again." : ""
  return `${s.cleared} of ${s.total} checks cleared on ${list.route}. Next: control ${next.n}, ${next.label}: "${next.workflow}" in "${next.state}".${waiting} You cannot finish until all are passed or waived.`
}

/** How many of a control's checks are cleared. */
export function controlProgress(c: Control, results: Result[]): { cleared: number; total: number; worst: CheckState } {
  let cleared = 0, total = 0
  const seen = new Set<CheckState>()
  for (const w of c.workflows) for (const s of c.states) {
    const st = checkState(results, checkKey(c.n, w.name, s))
    total++
    seen.add(st)
    if (st === "passed" || st === "waived") cleared++
  }
  const worst: CheckState = seen.has("failed") ? "failed" : seen.has("disputed") ? "disputed" : seen.has("pending") ? "pending" : seen.has("waived") && !seen.has("passed") ? "waived" : "passed"
  return { cleared, total, worst }
}

export interface ControlChange {
  view: string
  label: string
  kind: string
}

/**
 * What changed between two versions of a page's checklist. This is the parity
 * check: a control that was there and is now gone has to be accounted for, and
 * so does one that appeared. Controls are matched by view, label and kind.
 */
export function diffChecklists(before: Checklist | null, after: Checklist): { added: ControlChange[]; removed: ControlChange[]; kept: number } {
  const flat = (l: Checklist | null) => (l?.views ?? []).flatMap((v) => v.controls.map((c) => ({ view: v.key, label: c.label, kind: c.kind })))
  const id = (c: ControlChange) => [c.view, c.kind, c.label].join(SEP)
  const a = flat(before), b = flat(after)
  const inA = new Set(a.map(id)), inB = new Set(b.map(id))
  return { added: before ? b.filter((c) => !inA.has(id(c))) : [], removed: a.filter((c) => !inB.has(id(c))), kept: b.filter((c) => inA.has(id(c))).length }
}

/** Two checklists ask for the same checks on the same controls in the same places. */
export function sameChecklist(a: Checklist, b: Checklist): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface StoredImage {
  id: string
  kind: "view" | "evidence"
  /** The checklist version it belongs to. */
  version: number
  /** For evidence: the check it proves. */
  key?: string
  capturedAt: string
}

/** How long a picture of a cleared check is kept. */
export const EVIDENCE_DAYS = 3

/**
 * Which pictures to delete (owner 2026-11-13: only a couple need to remain,
 * and only for a short time).
 *   View pictures: kept for the current version and the one before it, so a
 *   redesign can be compared with what it replaced. Only the newest per view.
 *   Evidence: only the newest picture per check. It is kept while the check is
 *   failed or disputed, and for EVIDENCE_DAYS after it was taken otherwise.
 *   Evidence from older versions goes.
 */
export function imagesToExpire(images: StoredImage[], currentVersion: number, stateOf: (key: string) => CheckState, now: Date, viewKeyOf: (img: StoredImage) => string = (i) => i.key ?? ""): string[] {
  const gone: string[] = []
  const newest = new Map<string, StoredImage>()
  for (const img of images) {
    const slot = [img.kind, img.version, viewKeyOf(img)].join(SEP)
    const cur = newest.get(slot)
    if (!cur || img.capturedAt > cur.capturedAt) newest.set(slot, img)
  }
  const cutoff = now.getTime() - EVIDENCE_DAYS * 86400_000
  for (const img of images) {
    const slot = [img.kind, img.version, viewKeyOf(img)].join(SEP)
    if (newest.get(slot) !== img) { gone.push(img.id); continue }
    if (img.kind === "view") { if (img.version < currentVersion - 1) gone.push(img.id); continue }
    if (img.version !== currentVersion) { gone.push(img.id); continue }
    const st = stateOf(img.key ?? "")
    if (st === "failed" || st === "disputed") continue
    if (new Date(img.capturedAt).getTime() < cutoff) gone.push(img.id)
  }
  return gone
}
