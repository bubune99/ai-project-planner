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
  /** What the scan found wrong with the control itself: no name, covered, too small, a dead link. */
  issues?: string[]
  states: string[]
  workflows: Workflow[]
}

export interface View {
  key: string
  name: string
  /** Size of the view's picture, in the same units as its controls. */
  w: number
  h: number
  /** Where this view sits inside its stored page extract: its corner, and the size the extract was taken at. */
  crop?: { x: number; y: number; vw: number; vh: number }
  controls: Control[]
}

export interface Checklist {
  route: string
  title?: string
  views: View[]
}

/**
 * scan: the scripted scanner. What it reports is a claim, not a verdict: it is quick and wide, and sometimes wrong.
 * A claim has to pass a second gate, a model that looks at the real thing against the criterion, before it counts.
 */
export type Actor = "scan" | "builder" | "reviewer" | "owner"
export type Verdict = "passed" | "failed" | "waived"
/** flagged: the scan claims a problem and nobody has validated the claim yet. */
export type CheckState = "pending" | "flagged" | "passed" | "failed" | "waived" | "disputed"

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

/** A finding with its measurements taken out, so the same finding on the next scan is recognized ("16 pixels" and "18 pixels" are one finding). */
export const findingSignature = (view: string, label: string, kind: string, note: string) => [view, kind, label, note.replace(/[\d.]+/g, "#")].join(SEP)

/** The claims a scan's own findings amount to: one per flagged item, on its first check. */
export function scanFindings(list: Checklist): { key: string; note: string; signature: string }[] {
  return list.views.flatMap((v) => v.controls.filter((c) => c.issues?.length && c.workflows.length && c.states.length)
    .map((c) => ({ key: checkKey(c.n, c.workflows[0].name, c.states[0]), note: `Found by the scan: ${c.issues!.join("; ")}.`, signature: findingSignature(v.key, c.label, c.kind, c.issues!.join("; ")) })))
}

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
  const b = latest("builder"), r = latest("reviewer"), scan = latest("scan")
  const verdict = (x?: Result): "passed" | "failed" | null => (x && x.status !== "waived" ? x.status : null)
  // A scan's claim stands as "flagged" until a reviewer has looked since. The reviewer confirming it makes it a
  // failure; the reviewer dismissing it removes the claim and the check goes back to wherever the work stands.
  if (scan && scan.status === "failed") {
    const since = r && r.at >= scan.at ? r : undefined
    if (!since) return "flagged"
    if (since.status === "failed") return "failed"
    return verdict(b && b.at >= scan.at ? b : undefined) ?? "pending"
  }
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
  /** Claimed by the scan, not yet validated. */
  flagged: number
  disputed: number
  pending: number
  /** Cleared checks a reviewer or the owner has also looked at. */
  reviewed: number
  /** Nothing left to do: every check is passed or waived. */
  done: boolean
}

export function summarize(list: Checklist, results: Result[]): Summary {
  const s: Summary = { total: 0, cleared: 0, passed: 0, waived: 0, failed: 0, flagged: 0, disputed: 0, pending: 0, reviewed: 0, done: false }
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
  // Confirmed failures first, then the scan's unvalidated claims, then untouched checks. A dispute waits for the owner.
  return open.find((c) => c.state_now === "failed") ?? open.find((c) => c.state_now === "flagged") ?? open.find((c) => c.state_now === "pending") ?? open[0] ?? null
}

/** The line a hook gives the agent after each check. */
export function hookLine(list: Checklist, results: Result[]): string {
  const s = summarize(list, results), next = nextCheck(list, results)
  if (!s.total) return `${list.route} has no checks yet.`
  if (!next) return `All ${s.total} checks on ${list.route} are cleared. You may finish; the evidence goes to the reviewer.`
  const waiting = next.state_now === "disputed" ? " It is disputed and waits for the owner."
    : next.state_now === "failed" ? " It failed last time: fix it, then check it again."
    : next.state_now === "flagged" ? " The scan flagged it and nobody has validated that yet: look at the real thing against the criterion, then confirm it or dismiss it as the reviewer, with what you saw." : ""
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
  const worst: CheckState = seen.has("failed") ? "failed" : seen.has("flagged") ? "flagged" : seen.has("disputed") ? "disputed" : seen.has("pending") ? "pending" : seen.has("waived") && !seen.has("passed") ? "waived" : "passed"
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
  /** view: a picture of a view. extract: the view's styled HTML, drawn by the planner. evidence: a picture proving a check. */
  kind: "view" | "extract" | "evidence"
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
 *   View pictures and extracts: kept for the current version and the one before it, so a
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
    if (img.kind !== "evidence") { if (img.version < currentVersion - 1) gone.push(img.id); continue }
    if (img.version !== currentVersion) { gone.push(img.id); continue }
    const st = stateOf(img.key ?? "")
    if (st === "failed" || st === "disputed") continue
    if (new Date(img.capturedAt).getTime() < cutoff) gone.push(img.id)
  }
  return gone
}

/* ── The plan: what a page is supposed to have ───────────────────────────────
 * The checklist above is what a scan FOUND. The plan is what was EXPECTED,
 * written before or during the build (from the owner's words, an approved
 * mock-up, a flow, or an agent's reading of the task). Comparing the two is
 * how a new build is held to everything it should have, and how a control that
 * nobody planned is noticed.
 */

export type ExpectSource = "owner" | "mockup" | "flow" | "agent"

export interface Expected {
  id: string
  label: string
  /** Only matched when given. */
  kind?: string
  /** The view it belongs in. Only matched when given. */
  view?: string
  /** What it must do, in words. */
  must: string
  source: ExpectSource
}

export interface PlanCompare {
  matched: { expected: Expected; n: number }[]
  /** Expected, not on the page, and nobody is waiting on the owner about it. */
  missing: Expected[]
  /** Expected, not on the page, with a removal waiting for the owner. */
  waiting: Expected[]
  /** On the page, not in the plan. */
  unplanned: { n: number; view: string; label: string; kind: string }[]
}

/** Kinds of item a scan lists that are content rather than controls. */
export const CONTENT_KINDS = new Set(["Text", "Card", "Chart"])

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

/** Sets what a scan found against what was expected. Each control answers at most one expectation. */
export function comparePlan(expected: Expected[], list: Checklist, waitingRemoval: string[] = []): PlanCompare {
  const controls = list.views.flatMap((v) => v.controls.map((c) => ({ n: c.n, view: v.key, label: c.label, kind: c.kind })))
  const used = new Set<number>()
  const out: PlanCompare = { matched: [], missing: [], waiting: [], unplanned: [] }
  for (const e of expected) {
    const hit = controls.find((c) => !used.has(c.n) && norm(c.label) === norm(e.label) && (!e.kind || norm(e.kind) === norm(c.kind)) && (!e.view || e.view === c.view))
    if (hit) { used.add(hit.n); out.matched.push({ expected: e, n: hit.n }) }
    else if (waitingRemoval.includes(e.id)) out.waiting.push(e)
    else out.missing.push(e)
  }
  // Words, cards and charts are the page's content, checked in their own right, not controls someone forgot to plan.
  out.unplanned = controls.filter((c) => !used.has(c.n) && !CONTENT_KINDS.has(c.kind))
  return out
}

/** True when the page has everything planned and nothing unplanned. Waiting on the owner does not hold the agent. */
export const planClear = (c: PlanCompare) => c.missing.length === 0 && c.unplanned.length === 0

const few = (labels: string[]) => labels.slice(0, 4).join(", ") + (labels.length > 4 ? `, and ${labels.length - 4} more` : "")

/** The plan's part of the line a hook gives the agent. Empty when there is nothing to do. */
export function planLine(c: PlanCompare): string {
  const parts: string[] = []
  if (c.missing.length) parts.push(`${c.missing.length} planned control${c.missing.length === 1 ? " is" : "s are"} not on the page (${few(c.missing.map((e) => e.label))}): build ${c.missing.length === 1 ? "it" : "them"}, or propose removing ${c.missing.length === 1 ? "it" : "them"} from the plan with a reason`)
  if (c.unplanned.length) parts.push(`${c.unplanned.length} control${c.unplanned.length === 1 ? " is" : "s are"} on the page but not in the plan (${few(c.unplanned.map((u) => u.label))}): add ${c.unplanned.length === 1 ? "it" : "them"} to the plan with a reason, or take ${c.unplanned.length === 1 ? "it" : "them"} out of the build`)
  if (!parts.length) return c.waiting.length ? `${c.waiting.length} planned control${c.waiting.length === 1 ? "" : "s"} waiting on the owner's answer (${few(c.waiting.map((e) => e.label))}); carry on with the rest.` : ""
  return `Against the plan: ${parts.join("; ")}.`
}

/** What a change to the plan rests on. */
export type Basis = "owner_asked" | "rule" | "evidence" | "judgment"

export interface PlanChange {
  action: "add" | "remove"
  item: Expected
  reason: string
  basis: Basis
  /** The owner's own words, when the basis is that the owner asked. */
  quote?: string
  /** For a removal: the label of the planned control that takes its place. */
  replacedBy?: string
}

export interface PlanContext {
  /** A version of this page has been checked on production: people use it. */
  shipped: boolean
  /** Labels in the plan after this change would apply. */
  labels: string[]
}

/** Things that are the owner's call wherever they appear: who can get in, money, and destroying or exposing data. */
const SENSITIVE = /\b(delete|destroy|erase|sign.?out|log.?out|pay|payment|price|pricing|billing|refund|charge|permission|role|access|admin|password|invite|share|publish|export)\b/i

/** True when a change is about access, money, or destroying or exposing data. */
export const isSensitive = (p: Pick<PlanChange, "item" | "reason">) => SENSITIVE.test([p.item.label, p.item.must, p.reason].join(" "))

export function validateChange(p: PlanChange): Issue[] {
  const issues: Issue[] = []
  if (!p.item?.label?.trim()) issues.push({ where: "item", message: "Say which control" })
  if (p.action === "add" && !p.item?.must?.trim()) issues.push({ where: "item", message: "Say what it must do" })
  if (!p.reason || p.reason.trim().length < 12) issues.push({ where: "reason", message: "Give a reason someone reading later can follow" })
  if (p.basis === "owner_asked" && (!p.quote || p.quote.trim().length < 8)) issues.push({ where: "quote", message: "Quote the owner's words that asked for this" })
  return issues
}

/**
 * Should the owner be asked before this change to the plan takes effect?
 * (owner 2026-11-13: this runs on its own; include me when my request, the
 * rules and common sense say so, not by default.)
 *
 * The reasoning, in order:
 *   - What the owner asked for in their own words is already decided.
 *   - Anything about access, money or destroying data is theirs to decide.
 *   - Adding an expectation only makes the checks stricter: safe.
 *   - An agent may withdraw its own guess while the page has not shipped.
 *   - A control that was replaced by another planned one is not lost.
 *   - Dropping something people already use, or something the owner's plan
 *     asked for, is theirs to decide.
 * Being asked never stops the work: the item waits and everything else goes on.
 */
export function decideChange(p: PlanChange, ctx: PlanContext): { needsOwner: boolean; why: string } {
  if (p.basis === "owner_asked" && p.quote && p.quote.trim().length >= 8) return { needsOwner: false, why: `The owner asked for it: "${p.quote.trim()}"` }
  if (isSensitive(p)) return { needsOwner: true, why: "It concerns access, money, or destroying or exposing data, which is the owner's call." }
  if (p.action === "add") return { needsOwner: false, why: "Adding an expectation only makes the checks stricter." }
  if (p.replacedBy && ctx.labels.some((l) => norm(l) === norm(p.replacedBy!))) return { needsOwner: false, why: `It is replaced by "${p.replacedBy}", which is in the plan, so nothing is lost.` }
  if (ctx.shipped) return { needsOwner: true, why: "People already use this page; dropping something from it is the owner's call." }
  if (p.item.source === "agent") return { needsOwner: false, why: "An agent added it during this build and the page has not shipped, so the agent may withdraw it." }
  return { needsOwner: true, why: `It came from the ${p.item.source === "owner" ? "owner's own request" : p.item.source === "mockup" ? "approved mock-up" : "flow"}, and the owner has not said to drop it.` }
}
