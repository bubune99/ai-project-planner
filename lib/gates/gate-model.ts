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

/**
 * What a workflow proves, which decides the states it is checked in. Owner 2026-11-17: "Clicking for functionality is
 * one thing that needs to be checked only on light or dark mode. Ensuring colors are right is another thing. Ensuring
 * behaviors and action states is important as well."
 *   function  pressing it does the right thing: checked once, in the control's first state (the default)
 *   look      colors, contrast and layout: checked in every state (each theme, each width), on a picture
 *   states    hover, focus, pressed, disabled, loading, error, empty: checked once, in the first state
 */
export type WorkflowKind = "function" | "look" | "states"
export const WORKFLOW_KINDS: readonly WorkflowKind[] = ["function", "look", "states"]

export interface Workflow {
  name: string
  /** What it proves; missing means "function". */
  kind?: WorkflowKind
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
  /** Its workflows were written by the scanner from the kind of control, and nobody has replaced them yet. */
  draft?: boolean
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
  /**
   * Real screenshots that together show this view. Each is a capture of the whole screen (vw by vh); the part from
   * (x, y) of size w by h belongs in the view's picture, starting `at` that far down it. A page taller than the screen
   * has one per screenful; a later one may be narrower (`ax` across), when only part of the screen scrolls. The picture itself is stored under "<view key>@<id>".
   */
  shots?: Shot[]
  /** For a view something opens: the name of the control that opens it. */
  openedBy?: string
  controls: Control[]
}

export interface Shot { id: string; x: number; y: number; w: number; h: number; at: number; vw: number; vh: number; /** How far across the view its part starts (0 when absent). */ ax?: number }

/** The screenshot that shows a point of a view (this far across and this far down), if any. */
export function shotAt(view: View, x: number, y: number): Shot | null {
  return (view.shots ?? []).filter((s) => y >= s.at && y < s.at + s.h && x >= (s.ax ?? 0) && x < (s.ax ?? 0) + s.w).at(-1) ?? null
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

/** The states a workflow is checked in: every state for a look, the first state for anything else. */
export function workflowStates(c: Pick<Control, "states">, w: Pick<Workflow, "kind">): string[] {
  if (!c.states.length) return []
  return w.kind === "look" ? [...c.states] : [c.states[0]]
}

const PROBLEM = new Set<string>(["failed", "flagged", "disputed"])

/**
 * The states a workflow is open in: the ones it is checked in, plus any other state where a problem is on record. A
 * failure recorded before checks were sorted by kind never disappears; it stays open until it is cleared.
 */
export function checkStates(c: Pick<Control, "n" | "states">, w: Pick<Workflow, "name" | "kind">, results?: Result[]): string[] {
  const need = new Set(workflowStates(c, w))
  return c.states.filter((s) => need.has(s) || (results !== undefined && PROBLEM.has(checkState(results, checkKey(c.n, w.name, s)))))
}

/** Every check that can take a verdict: each workflow in each state, whether or not that state is required. */
export function everyCheck(list: Checklist): CheckRef[] {
  const out: CheckRef[] = []
  for (const v of list.views) for (const c of v.controls) for (const w of c.workflows) for (const s of c.states) {
    out.push({ key: checkKey(c.n, w.name, s), view: v.key, n: c.n, label: c.label, workflow: w.name, state: s })
  }
  return out
}

/** Every check in the list, in the order they should be worked. With the results, problems on record in other states are included. */
export function allChecks(list: Checklist, results?: Result[]): CheckRef[] {
  const out: CheckRef[] = []
  for (const v of list.views) for (const c of v.controls) for (const w of c.workflows) for (const s of checkStates(c, w, results)) {
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
        if (w.kind !== undefined && !WORKFLOW_KINDS.includes(w.kind)) say(`${where}, ${w.name}`, `A workflow's kind is one of ${WORKFLOW_KINDS.join(", ")}`)
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
  for (const c of allChecks(list, results)) {
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
  const open = allChecks(list, results).map((c) => ({ ...c, state_now: checkState(results, c.key) })).filter((c) => c.state_now !== "passed" && c.state_now !== "waived")
  // Confirmed failures first, then the scan's unvalidated claims, then untouched checks. A dispute waits for the owner.
  return open.find((c) => c.state_now === "failed") ?? open.find((c) => c.state_now === "flagged") ?? open.find((c) => c.state_now === "pending") ?? open[0] ?? null
}

/** The line a hook gives the agent after each check. */
export function hookLine(list: Checklist, results: Result[]): string {
  const s = summarize(list, results), next = nextCheck(list, results)
  if (!s.total) return `${list.route} has no checks yet.`
  // Not "You may finish": a cleared page is not the end of a session (owner, 2026-11-21: "you are reverting from the
  // ability to do long running tasks"). The board decides when the work is done.
  if (!next) return `All ${s.total} checks on ${list.route} are cleared; the evidence goes to the reviewer. Take the next card on the board.`
  const waiting = next.state_now === "disputed" ? " It is disputed and waits for the owner."
    : next.state_now === "failed" ? " It failed last time: fix it, then check it again."
    : next.state_now === "flagged" ? " The scan flagged it and nobody has validated that yet: look at the real thing against the criterion, then confirm it or dismiss it as the reviewer, with what you saw." : ""
  return `${s.cleared} of ${s.total} checks cleared on ${list.route}. Next: control ${next.n}, ${next.label}: "${next.workflow}" in "${next.state}".${waiting} You cannot finish until all are passed or waived.`
}

/** How many of a control's checks are cleared. */
export function controlProgress(c: Control, results: Result[]): { cleared: number; total: number; worst: CheckState } {
  let cleared = 0, total = 0
  const seen = new Set<CheckState>()
  for (const w of c.workflows) for (const s of checkStates(c, w, results)) {
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
  const id = (c: ControlChange) => [c.view, c.kind, idLabel(c.label)].join(SEP)
  const a = flat(before), b = flat(after)
  const inA = new Set(a.map(id)), inB = new Set(b.map(id))
  return { added: before ? b.filter((c) => !inA.has(id(c))) : [], removed: a.filter((c) => !inB.has(id(c))), kept: b.filter((c) => inA.has(id(c))).length }
}

/** Two checklists ask for the same checks on the same controls in the same places. */
export function sameChecklist(a: Checklist, b: Checklist): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/* ── Keeping what is known between scans ─────────────────────────────────────
 * A scan maps the page again every time it runs. What was learned must not be
 * mapped again with it: the criteria someone wrote for a control, and the
 * verdicts already given, belong to the control, not to one scan of it. So a
 * new scan is lined up with the last checklist: the same control keeps its
 * number, its written criteria and its verdicts. Only what is new or changed
 * starts fresh.
 */

/** What makes a control the same control from one scan to the next: its view, kind and name (and which one, if several share them). */
function identities(list: Checklist): Map<Control, string> {
  const seen = new Map<string, number>(), out = new Map<Control, string>()
  for (const v of list.views) for (const c of v.controls) {
    const base = [v.key, c.kind, idLabel(c.label)].join(SEP), k = (seen.get(base) ?? 0) + 1
    seen.set(base, k)
    out.set(c, `${base}${SEP}${k}`)
  }
  return out
}

/** What is asked of a control, apart from where it sits and what the last scan thought of it. */
// Compared by content, not by the order a sender wrote the fields in: the same step sent as {do, expect, there} and
// stored as {do, there, expect} counted as changed, and a save threw away every verdict on the page (/feedback, 2026-11-24).
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v
const criteria = (c: Control) => JSON.stringify(canonical([c.states, c.workflows]))

/**
 * Lines a fresh scan up with the checklist before it. A control found again
 * keeps its number. If the scan only brought draft workflows for it and
 * written ones exist, the written ones are kept. New controls take new numbers.
 */
export function alignToPrevious(prev: Checklist | null, next: Checklist): Checklist {
  if (!prev) return next
  const before = new Map<string, Control>()
  for (const [c, id] of identities(prev)) before.set(id, c)
  const ids = identities(next)
  let top = Math.max(0, ...prev.views.flatMap((v) => v.controls.map((c) => c.n)))
  const used = new Set<number>()
  const views = next.views.map((v) => ({ ...v, controls: v.controls.map((c) => {
    const old = before.get(ids.get(c)!)
    if (!old || used.has(old.n)) return { ...c, n: 0 }
    used.add(old.n)
    const keep = c.draft && !old.draft ? { states: old.states, workflows: old.workflows, draft: undefined } : {}
    return { ...c, ...keep, n: old.n }
  }) }))
  for (const v of views) for (const c of v.controls) { if (c.n === 0) c.n = ++top; if (c.draft === undefined) delete c.draft }
  return { ...next, views }
}

/** A part of a view, in the view's own units. */
export interface Region { x: number; y: number; w: number; h: number }

const inside = (r: Region, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

/**
 * A targeted scan looked at one part of the page only. This puts what it found back into the whole checklist:
 * inside the region, the scan is the truth (a control it did not find there is gone); outside it, nothing changes.
 * Views the scan did not open are kept as they were. Returns the merged list and the numbers of the controls the
 * region covers in the old list, whose verdicts need another look.
 */
export function mergePartial(prev: Checklist, part: Checklist, region: Region): { list: Checklist; touched: number[] } {
  const touched: number[] = []
  const views = prev.views.map((v) => {
    const scanned = part.views.find((p) => p.key === v.key)
    if (v.key !== "page") return scanned ? { ...scanned, shots: scanned.shots ?? v.shots } : v
    if (!scanned) return v
    const kept = v.controls.filter((c) => { const hit = inside(region, c.x + c.w / 2, c.y + c.h / 2); if (hit) touched.push(c.n); return !hit })
    // Earlier close-up screenshots that the new one covers completely are dropped; the page's own screenfuls stay.
    const shots = [...(v.shots ?? []).filter((s) => !(s.id.startsWith("t") && (s.ax ?? 0) >= region.x && s.at >= region.y && (s.ax ?? 0) + s.w <= region.x + region.w && s.at + s.h <= region.y + region.h)), ...(scanned.shots ?? [])]
    return { ...v, controls: [...kept, ...scanned.controls], ...(shots.length ? { shots } : {}) }
  })
  for (const p of part.views) if (!views.some((v) => v.key === p.key)) views.push(p)
  return { list: { ...prev, views }, touched }
}

/** The checks whose control and criteria are the same in both lists: their verdicts still stand. Expects `next` already aligned. */
export function standingKeys(prev: Checklist, next: Checklist): string[] {
  const before = new Map<number, [string, string]>()
  for (const [c, id] of identities(prev)) before.set(c.n, [id, criteria(c)])
  const out: string[] = []
  for (const [c, id] of identities(next)) {
    const old = before.get(c.n)
    if (old && old[0] === id && old[1] === criteria(c)) for (const w of c.workflows) for (const s of c.states) out.push(checkKey(c.n, w.name, s))
  }
  return out
}

/** Nothing about what is asked has changed: the same controls with the same criteria. Only places and scan findings may differ. */
export function sameCriteria(prev: Checklist, next: Checklist): boolean {
  const flat = (l: Checklist) => [...identities(l)].map(([c, id]) => [c.n, id, criteria(c)]).sort((a, b) => Number(a[0]) - Number(b[0]))
  return prev.route === next.route && JSON.stringify(flat(prev)) === JSON.stringify(flat(next))
}

/* ── The record: what happened, and how well the system is doing ───────────── */

export interface LogEntry { at: string; actor: Actor; status: Verdict; key: string; n: number; label: string; workflow: string; state: string; note?: string; what: string }

/** Every verdict in the order it was given, in words. */
export function auditLog(list: Checklist, results: Result[]): LogEntry[] {
  const ref = new Map(everyCheck(list).map((c) => [c.key, c]))
  const lastScan = new Map<string, string>()
  return [...results].sort((a, b) => a.at.localeCompare(b.at)).map((r) => {
    const c = ref.get(r.key)
    const afterClaim = lastScan.has(r.key)
    if (r.actor === "scan") lastScan.set(r.key, r.at)
    const what = r.actor === "scan" ? "The scan flagged it"
      : r.actor === "reviewer" ? (afterClaim ? (r.status === "failed" ? "The reviewer confirmed the flag" : "The reviewer dismissed the flag") : r.status === "failed" ? "The reviewer failed it" : "The reviewer passed it")
      : r.actor === "owner" ? (r.status === "waived" ? "The owner waived it" : r.status === "failed" ? "The owner failed it" : "The owner passed it")
      : r.status === "failed" ? "The builder reported it failing" : "The builder passed it"
    if (r.actor === "reviewer") lastScan.delete(r.key)
    return { at: r.at, actor: r.actor, status: r.status, key: r.key, n: c?.n ?? 0, label: c?.label ?? r.key, workflow: c?.workflow ?? "", state: c?.state ?? "", note: r.note, what }
  })
}

export interface Scorecard {
  /** Claims the scan has made, and what became of them. */
  claims: number
  confirmed: number
  dismissed: number
  unvalidated: number
  /** Of the claims judged, the share that were real. Null until one has been judged. */
  scanAccuracy: number | null
  /** Checks that passed the first time they were worked, out of those worked. */
  passedFirstTime: number
  worked: number
  /** Checks that failed at some point and pass now: problems found and fixed. */
  fixed: number
  /** Checks the builder passed that a reviewer or the owner then failed: what the second look caught. */
  caughtBySecondLook: number
}

/** How well the whole arrangement is working, from the record alone. */
export function scorecard(list: Checklist, results: Result[]): Scorecard {
  const s: Scorecard = { claims: 0, confirmed: 0, dismissed: 0, unvalidated: 0, scanAccuracy: null, passedFirstTime: 0, worked: 0, fixed: 0, caughtBySecondLook: 0 }
  for (const c of allChecks(list, results)) {
    const mine = results.filter((r) => r.key === c.key).sort((a, b) => a.at.localeCompare(b.at))
    let open: Result | null = null
    for (const r of mine) {
      if (r.actor === "scan" && r.status === "failed") { if (open) s.unvalidated++; s.claims++; open = r }
      else if (r.actor === "reviewer" && open) { if (r.status === "failed") s.confirmed++; else s.dismissed++; open = null }
    }
    if (open) s.unvalidated++
    const work = mine.filter((r) => r.actor === "builder")
    if (work.length) { s.worked++; if (work[0].status === "passed") s.passedFirstTime++ }
    const everFailed = mine.some((r) => r.status === "failed" && r.actor !== "scan"), now = checkState(results, c.key)
    if (everFailed && now === "passed") s.fixed++
    if (mine.some((r, i) => r.actor !== "builder" && r.actor !== "scan" && r.status === "failed" && mine.slice(0, i).some((b) => b.actor === "builder" && b.status === "passed"))) s.caughtBySecondLook++
  }
  const judged = s.confirmed + s.dismissed
  s.scanAccuracy = judged ? s.confirmed / judged : null
  return s
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
 *   A view picture the current version still shows (inUse) is kept whatever version took it: a close-up rescan
 *   carries the page's screenshots forward in its list without taking them again. Only the newest per key is kept.
 */
export function imagesToExpire(images: StoredImage[], currentVersion: number, stateOf: (key: string) => CheckState, now: Date, viewKeyOf: (img: StoredImage) => string = (i) => i.key ?? "", inUse?: (key: string) => boolean): string[] {
  const gone: string[] = []
  // The newest picture of each key the current version shows, across every version.
  const carried = new Map<string, StoredImage>()
  if (inUse) for (const img of images) {
    if (img.kind !== "view" || !img.key || !inUse(img.key)) continue
    const cur = carried.get(img.key)
    if (!cur || img.version > cur.version || (img.version === cur.version && img.capturedAt > cur.capturedAt)) carried.set(img.key, img)
  }
  const newest = new Map<string, StoredImage>()
  for (const img of images) {
    const slot = [img.kind, img.version, viewKeyOf(img)].join(SEP)
    const cur = newest.get(slot)
    if (!cur || img.capturedAt > cur.capturedAt) newest.set(slot, img)
  }
  const cutoff = now.getTime() - EVIDENCE_DAYS * 86400_000
  for (const img of images) {
    const slot = [img.kind, img.version, viewKeyOf(img)].join(SEP)
    if (inUse && img.kind === "view" && img.key && inUse(img.key)) { if (carried.get(img.key) !== img) gone.push(img.id); continue }
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
  /** The answers given about it, by question id: why it is there, who uses it, where its content comes from. */
  answers?: Record<string, Answer>
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
/**
 * A control's name for matching it across scans: numbers in it (live prices, counts, P&L) read as one placeholder,
 * so "Long BTC 59,765" and "Long BTC 61,486" are the same control. A price move made every such control count as
 * gone and lose its verdicts (crypto-collab page /, 2026-11-24).
 */
export const idLabel = (s: string) => norm(s).replace(/[−+-]?\d[\d,.]*%?/g, "#")

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
  // A row repeated for each item in a list (a bag's "Remove" on every line) is one planned control: the plan takes a
  // name once, so the copies of a matched control, same view, kind and name, are covered by it (BYB /checkout/cancel
  // 2026-11-24: three identical bag lines left six controls "not in the plan" that the plan refused to add again).
  const sameAs = (a: { view: string; label: string; kind: string }, b: { view: string; label: string; kind: string }) => a.view === b.view && norm(a.kind) === norm(b.kind) && norm(a.label) === norm(b.label)
  const matchedControls = controls.filter((c) => used.has(c.n))
  // Words, cards and charts are the page's content, checked in their own right, not controls someone forgot to plan.
  out.unplanned = controls.filter((c) => !used.has(c.n) && !CONTENT_KINDS.has(c.kind) && !matchedControls.some((m) => sameAs(m, c)))
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

/* ── Intent: the questions asked about each thing before it is built ─────────
 * A feature list says what will be on a page. It does not say why, for whom,
 * or where each figure comes from, and those are what a build gets wrong. So
 * every planned item is asked a short set of questions that depend on what
 * kind of thing it is. Each answer records who gave it and what it rests on,
 * so the reasoning behind a design can be followed later.
 */

export interface Answer {
  text: string
  /** owner: they said it. agent: a planning agent worked it out. */
  by: "owner" | "agent"
  basis: Basis
  /** The owner's own words, when the answer rests on them. */
  quote?: string
  at: string
}

export interface IntakeQuestion { id: string; ask: string; why: string; /** Only the owner can know this: it is about what they want, not about what the code does. */ owner: boolean }

/** Questions about what is wanted are the owner's. Questions about what the product does can be answered from the code. */
const OWNERS = new Set(["purpose", "who", "flow", "order"])
const Q = (id: string, ask: string, why: string): IntakeQuestion => ({ id, ask, why, owner: OWNERS.has(id) })
const ALWAYS = [
  Q("purpose", "What is it for? What could someone not do without it?", "A thing with no purpose anyone can state should not be built."),
  Q("who", "Who uses it, and who must not be able to?", "This decides what each kind of person sees and what is refused."),
  Q("flow", "Which use case is it part of, what comes just before and just after it, and does the person have to remember anything from the step before?", "A control checked alone can pass while the journey it belongs to is broken. People hold only a few things in mind at once (Working Memory, Miller's Law): carry it forward for them."),
]
const CONTENT = [
  Q("source", "Is this typed in by someone, or worked out from something else?", "What is typed needs a way to change it. What is worked out must never be typed over."),
  Q("from", "If it is worked out: from what, and when does it change?", "This is what the figure is checked against."),
  Q("empty", "What shows when there is nothing yet?", "An empty state nobody designed is a blank or a wrong zero."),
]
// Anything that shows many rows of the same kind: a table, a task list, an inbox, a ledger.
// Owner, 2026-11-15: "we need to have a system for filters and questions and gates of reasoning to keep in mind for
// future projects as well". Each question is something My work lacked when he first used it.
const ROWS = [
  Q("onrow", "For every field a row shows: can it be changed on the row itself? Name each field that cannot.", "A list that shows a status, a priority and a date but only lets one be changed sends the person to another screen for the rest."),
  Q("narrow", "How is a long list narrowed? Each filter is a dropdown on the column it filters, and the columns combine. Chips are only for three or fewer options that fit one line on a phone. Which filter breaks this?", "A row of chips wraps onto several lines and is detached from what it filters."),
  Q("several", "Can several rows be selected and changed together, and can that be undone?", "Anything done to one row will be wanted for twenty."),
  Q("reach", "With hundreds of rows, are the actions for what is selected in reach wherever the list is scrolled?", "A bar at the end of a long list is a bar nobody can use."),
  Q("remove", "Can a row be removed here, and brought back?", "A list that only grows is a list nobody trusts."),
  Q("long", "What does it look like with 400 rows, and how does someone see what is old or no longer true?", "Lists are designed with ten rows and lived in with hundreds."),
]
const BY_KIND: Record<string, IntakeQuestion[]> = {
  Field: [Q("kept", "What happens to what is typed: where is it kept, and what else changes because of it?", "This is the action check for the field."), Q("refused", "What must be refused, which other ways of writing the same thing must still be accepted (spaces, capitals, symbols, a pasted value), and what does the person see then?", "Limits nobody stated are limits nobody checks. Accept what people type and keep one exact form (Postel's Law)."), Q("fill", "What can be filled in for them: a sensible default, the last value, something worked out?", "Every system keeps some complexity; the product should carry it, not the person (Tesler's Law), and a field left open takes as long as it is given (Parkinson's Law).")],
  Button: [Q("changes", "What does pressing it change?", "This is the action check for the button."), Q("undo", "Can it be undone? If not, is the person asked first?", "Anything that cannot be undone is the owner's to approve."), Q("answer", "What does the person see within 0.4 seconds of pressing it, and at the end, how do they know it worked?", "A reply under 0.4 seconds keeps people working (Doherty Threshold); the end of an action is what they remember of it (Peak-End Rule). Is it big enough and near where they are looking (Fitts's Law)?")],
  Switch: [Q("changes", "What is different when it is on?", "This is the action check for the switch."), Q("default", "Which way is it set to start with, and is that the safe choice for someone who never touches it?", "Most people keep the default (Cognitive Bias), so the default is a decision.")],
  Tab: [Q("changes", "What does it show that the other tabs do not?", "Tabs that show the same thing are one tab.")],
  Link: [],
  // Anything that opens over the page: a menu, a dialog, a panel, a right-click menu.
  Menu: [Q("closes", "Every way it closes: choosing something, pressing outside it, Esc. Which of these is missing?", "A menu that only closes one way traps the person who opened it by accident."), Q("reach", "Can everything in it also be reached from something visible on the page?", "What is only behind a right-click or a shortcut is not found by someone who was never told."), Q("choices", "How many choices does it offer at once? Past about seven, how are they grouped, and are the most used first or last?", "Each extra choice slows the decision (Hick's Law, Choice Overload); people hold about seven (Miller's Law) and remember the first and last best (Serial Position Effect).")],
  // Anything a person builds or arranges things in: a map, a board, a form builder, a list they order.
  Editor: [
    Q("complete", "For every kind of thing it shows: can it be added, changed, moved and removed here? Name each kind, and each action that is missing.", "An editor that shows lanes but cannot add one is half an editor. The missing actions are the feature list."),
    Q("between", "Can something be put in between two existing things, not only at the end?", "Real work is mostly inserting and rearranging, not appending."),
    Q("tidy", "When things are moved, what keeps them lined up and their connections true?", "Without it every change leaves a mess the person has to clean up by hand."),
    Q("undo", "Can any change be undone, and redone?", "People only try things in an editor they can back out of."),
    Q("found", "How does someone who was never told find each action?", "This decides what is a visible button and what may hide in a menu. People start without reading anything (Paradox of the Active User) and expect it to work like tools they already use (Jakob's Law)."),
    Q("unfinished", "Is unfinished work shown where they will see it next time, so it can be picked up?", "Unfinished things stay on people's minds (Zeigarnik Effect); the product should hold them instead."),
  ],
  List: ROWS,
  Text: CONTENT,
  Card: [...CONTENT, Q("order", "What is the most important thing in it, is that the first thing seen, and is it the only thing that stands out?", "This is what its layout is judged against. People notice what serves their goal (Selective Attention) and remember the one thing that differs (Von Restorff Effect): one standout, not five."), Q("together", "Do the things that belong together sit closer to each other than to anything else, look alike, and come in a few small groups?", "Nearness, likeness and connection are how people see what belongs together (Law of Proximity, Similarity, Common Region, Uniform Connectedness); small groups are easier to take in (Chunking).")],
  Chart: [...CONTENT, Q("agrees", "Which figures elsewhere must it agree with?", "A chart is right only if it matches the numbers it is drawn from."), Q("simple", "Can it be read at a glance? How many series, colors or slices does it use?", "People read a picture in its simplest form (Law of Pr\u00e4gnanz) and hold about seven things (Miller's Law).")],
  // A list of rows set out in columns. Everything a list is asked, and what the columns add.
  Table: [
    ...ROWS,
    Q("sort", "Which columns can it be sorted by, how does the heading show which one and which way, and is a filter for a column on that column's own heading?", "A table sorted by nothing the person chose hides what they came for; an order they cannot see is one they cannot trust."),
    Q("wide", "At phone width, which columns stay, which go, and how is what went still reached? Does anything spill out of the screen or get cut off?", "A table is designed at desktop width and read on a phone. What spills or is cut off is an error, not a matter of taste."),
  ],
  // Several fields filled in together and sent with one button.
  Form: [
    Q("names", "Which fields have no name a screen reader can read, tied to that field and still shown once something is typed?", "A field with no name cannot be found or filled by someone who does not see it, and a name that vanishes on typing has to be remembered (Working Memory)."),
    Q("accepts", "For each field: which ways of writing the same thing are taken (spaces, capitals, symbols, a pasted value), and what is filled in for the person already?", "Accept what people type and keep one exact form (Postel's Law); what the product can fill in, the person should not have to (Tesler's Law)."),
    Q("sends", "Does the button say what it sends, and does it say what it sends to whom or where when that is not plain? What is kept, and what else changes because of it?", "A button that says Submit or OK does not tell the person what pressing it will do. This is the action check for the form."),
    Q("wrong", "When something is refused, is it said beside the field it is about, in words that say how to put it right, with everything already typed kept?", "A form that clears itself on a mistake is filled in once. What the person sees at the end is what they remember of it (Peak-End Rule)."),
    Q("leave", "What happens to what is typed if the person leaves before sending: is it kept, or are they asked first?", "Unfinished things stay on people's minds (Zeigarnik Effect); typed work lost without a word is not forgiven."),
  ],
  // A box that opens over the page and holds the person there until it is dealt with.
  Dialog: [
    Q("closes", "Every way it closes: choosing something, pressing outside it, Esc. Which of these is missing?", "A dialog that only closes one way traps the person who opened it by accident."),
    Q("reach", "Can what it does also be reached from something visible on the page?", "What is only behind a right-click or a shortcut is not found by someone who was never told."),
    Q("focus", "When it opens, where does typing go, does Tab stay inside it, and when it closes, is the person put back where they were?", "Someone using the keyboard is otherwise left typing into the page behind it, or dropped at the top of the page when it closes."),
    Q("typed", "If something was typed in it and it is closed without sending, is that kept, or is the person asked first?", "Pressing outside by accident must not throw away what was typed."),
    Q("sends", "Does each of its buttons say what it does, and if one cannot be undone, is the safe choice the one Esc and pressing outside take?", "Buttons that say Yes, No or OK make the person read the question twice. Anything that cannot be undone is the owner's to approve."),
  ],
  // The controls that narrow a list or a table.
  "Filter bar": [
    Q("column", "Is each filter a dropdown on the column it filters, with chips used only where there are three or fewer options that fit on one line on a phone? Which filter breaks this?", "A row of chips wraps onto several lines and is detached from what it filters."),
    Q("combine", "Do the filters combine, so that two set together show only what matches both, and does search work together with them?", "People narrow by more than one thing at once. A filter that resets another is two half filters."),
    Q("showing", "Can the person see at a glance that the list is filtered and by what, how many rows are left, and clear one filter or all of them in one press?", "A filtered list that looks like the whole list makes people think rows are missing."),
    Q("none", "What shows when nothing matches, and does it say which filters are on and offer to clear them?", "An empty state nobody designed reads as lost data."),
    Q("kept", "Are the filters still set after opening a row and coming back, and after a reload?", "A filter that resets on every return is set again each time, and people stop using it."),
  ],
}

/** Every kind of thing that has its own questions, in the order they were written. Any other kind is asked what a button is asked. */
export const PLAYBOOK_KINDS: readonly string[] = Object.keys(BY_KIND)

/** The questions to settle about a planned item, by what kind of thing it is. */
export function intakeQuestions(kind: string | undefined): IntakeQuestion[] {
  return [...ALWAYS, ...(BY_KIND[kind ?? ""] ?? BY_KIND.Button)]
}

/*
 * The checks each of these kinds owes on a page, whatever the page is. They are the same rules as the questions
 * above, written as something to do and something to see. A scan that finds one of these on a page can give it
 * these workflows; whoever checks it replaces the words in general with what this one shows.
 */
const W = (name: string, kind: WorkflowKind, steps: Step[], before?: string): Workflow => ({ name, kind, ...(before ? { before } : {}), steps })
const LOOK = (what: string): Workflow => W("Look", "look", [{ do: `Look at the ${what} in this state`, expect: "Every word can be read, nothing is cut off or spills out, and nothing sits on top of anything else" }])
const KIND_WORKFLOWS: Record<string, Workflow[]> = {
  Table: [
    W("Change on the row", "function", [{ do: "Change one field of a row on the row itself", expect: "The row shows the new value, and it is still there after a reload" }]),
    W("Sort by a column", "function", [{ do: "Press a column heading", expect: "The rows are in that column's order and the heading shows which way" }, { do: "Press it again", expect: "The order is the other way round" }]),
    W("Change several", "function", [{ do: "Select several rows", expect: "The actions for what is selected are in reach without scrolling" }, { do: "Change them together, then undo", expect: "All of them changed, and all of them are back" }]),
    W("Nothing and too many", "states", [{ do: "Open it with no rows", expect: "It says there is nothing yet and what to do next" }, { do: "Open it with hundreds of rows", expect: "It still answers, and what is old can be told from what is new" }]),
    LOOK("table"),
  ],
  Form: [
    W("Send it", "function", [{ do: "Fill in every field the way a person would type it and press the button", expect: "The button said what it sends, what was typed is kept, and the person is told it worked" }]),
    W("Names", "function", [{ do: "Go through the fields with Tab and a screen reader", expect: "Every field is reached in order and says its own name" }]),
    W("Send it wrong", "states", [{ do: "Leave out something it needs, or type something it must refuse, and press the button", expect: "Nothing is sent, the reason is said beside the field, and everything else typed is still there" }]),
    W("Leave before sending", "function", [{ do: "Type in a field, then leave the page without sending", expect: "What was typed is kept, or the person is asked first" }]),
    LOOK("form"),
  ],
  Dialog: [
    W("Close by choosing", "function", [{ do: "Open it and choose something in it", expect: "It does what was chosen and closes" }]),
    W("Close by pressing outside", "function", [{ do: "Open it and press anywhere outside it", expect: "It closes and nothing has changed" }]),
    W("Close with Esc", "function", [{ do: "Open it and press Esc", expect: "It closes, nothing has changed, and focus is back on what opened it" }]),
    W("Keyboard stays inside", "function", [{ do: "Open it and press Tab until it comes round again", expect: "Focus started inside it and never went to the page behind" }]),
    LOOK("dialog"),
  ],
  "Filter bar": [
    W("Narrow by one column", "function", [{ do: "Pick a value in one column's filter", expect: "Only rows with that value are left, and it shows that the list is filtered and by what" }]),
    W("Combine two", "function", [{ do: "Pick a value in a second column's filter", expect: "Only rows that match both are left" }]),
    W("Clear", "function", [{ do: "Clear one filter", expect: "Its rows are back and the other filter still holds" }, { do: "Clear them all", expect: "Every row is back" }]),
    W("Nothing matches", "states", [{ do: "Pick filters that no row matches", expect: "It says nothing matches, names the filters that are on, and offers to clear them" }]),
    W("Still set on return", "function", [{ do: "Set a filter, open a row, and come back", expect: "The filter is still set" }]),
    LOOK("filter bar"),
  ],
}

/**
 * The workflows a thing of this kind owes, as a fresh copy the caller may change. Empty for kinds whose workflows
 * are written by the scan from the control itself (a button, a field, a link).
 */
export function kindWorkflows(kind: string | undefined): Workflow[] {
  return structuredClone(KIND_WORKFLOWS[kind ?? ""] ?? [])
}

/**
 * Where an answer stands. What the owner said, or what quotes them, is settled. What an agent worked out from
 * evidence or a rule is reasoned and stands unless the owner objects. An agent's own judgement is a proposal.
 */
export function answerState(a: Answer | undefined): "missing" | "settled" | "reasoned" | "proposed" {
  if (!a || !a.text.trim()) return "missing"
  if (a.by === "owner" || (a.basis === "owner_asked" && (a.quote?.trim().length ?? 0) >= 8)) return "settled"
  return a.basis === "judgment" ? "proposed" : "reasoned"
}

export interface IntakeStatus {
  items: number
  questions: number
  settled: number
  reasoned: number
  proposed: number
  missing: number
  /** Questions still to ask, why-it-exists before how-it-behaves. */
  open: { itemId: string; label: string; kind?: string; question: IntakeQuestion; state: "missing" | "proposed"; proposal?: string }[]
  /** Of the open ones: those only the owner can settle. The rest are an agent's to answer from the code. */
  forOwner: number
  forAgents: number
}

/** How far the questions about a page's planned items have been answered. */
export function intakeStatus(items: Expected[]): IntakeStatus {
  const s: IntakeStatus = { items: items.length, questions: 0, settled: 0, reasoned: 0, proposed: 0, missing: 0, open: [], forOwner: 0, forAgents: 0 }
  for (const it of items) for (const q of intakeQuestions(it.kind)) {
    const a = it.answers?.[q.id], st = answerState(a)
    // The owner is asked what only they can know. What an agent can find in the code is the agent's to answer, and
    // an unanswered one is the agent's unfinished work, not a question for the owner.
    if (st === "missing" || st === "proposed") { if (q.owner) s.forOwner++; else if (st === "missing") s.forAgents++ }
    s.questions++
    s[st]++
    if (st === "missing" || st === "proposed") s.open.push({ itemId: it.id, label: it.label, kind: it.kind, question: q, state: st, ...(st === "proposed" ? { proposal: a!.text } : {}) })
  }
  const rank = (id: string) => { const i = ALWAYS.findIndex((q) => q.id === id); return i < 0 ? 9 : i }
  s.open.sort((a, b) => rank(a.question.id) - rank(b.question.id))
  return s
}

/**
 * The line about intent for the agent. In an attended session every proposal is put to the owner as well; otherwise
 * only what nobody has answered at all is still to do.
 */
export function intakeLine(s: IntakeStatus, attended: boolean): string {
  const todo = s.open.filter((o) => attended || o.state === "missing")
  if (!todo.length) return ""
  const first = todo[0]
  return `${todo.length} question${todo.length === 1 ? "" : "s"} about what is planned ${todo.length === 1 ? "is" : "are"} not settled. Next, about "${first.label}": ${first.question.ask}${first.proposal ? ` (proposed: ${first.proposal})` : ""}`
}


/* ── Errors and preferences ──────────────────────────────────────────────────
 * The owner decides preferences. The owner does not decide errors (owner,
 * 2026-11-14: "I should be deciding on preferences, not deciding on errors").
 * An error is something that is wrong whoever looks at it: it cannot be read,
 * reached or used, it is cut off, it gives the wrong number. Agents find it,
 * confirm it, fix it and prove the fix, and it never reaches the owner as a
 * question. A preference is something reasonable people could want either
 * way: how much room a card has, what sits first, whether it feels right.
 * Only those, and what the owner alone can know about what they want, are
 * put to them. How often they are asked is theirs to set; errors are not
 * part of that setting at all.
 */

/** Findings about how something feels rather than whether it works. Everything else a scan reports is an error. */
const TASTE = /is empty|the rest is empty|comes within \d+ pixels of the|pixels from the left but|gaps between the cards|spaces between the cards|while almost everything else on the page is in/

/** Whether one finding is an error (wrong for anyone) or a matter of taste (the owner's to judge). */
export function findingClass(issue: string): "error" | "taste" {
  return TASTE.test(issue) ? "taste" : "error"
}

/** A control's findings split by who deals with them. */
export function splitFindings(issues: string[] | undefined): { errors: string[]; taste: string[] } {
  const out = { errors: [] as string[], taste: [] as string[] }
  for (const i of issues ?? []) out[findingClass(i) === "taste" ? "taste" : "errors"].push(i)
  return out
}

/** How much the owner wants to be part of the work. Errors are handled without them at every level. */
export type Involvement = "hands_on" | "preferences" | "report"

export interface OwnerAsk { kind: "map" | "question" | "taste" | "plan" | "feel"; text: string }

/**
 * What may be put to the owner at their chosen level.
 *   report       nothing. They read the record afterward.
 *   preferences  what only they can decide: what they want (their questions), matters of taste, changes to what they
 *                planned, and at the end whether the flow and the feel are right.
 *   hands_on     all of that, and they are shown the map of each page before work starts.
 * Nothing here is ever an error: "is this broken?" is not a question for the owner.
 */
export function ownerAsks(level: Involvement, s: { mapConfirmed: boolean; ownerQuestions: number; tasteFindings: number; planWaiting: number; cleared: boolean; signedOff: boolean }): OwnerAsk[] {
  if (level === "report") return []
  const asks: OwnerAsk[] = []
  if (level === "hands_on" && !s.mapConfirmed) asks.push({ kind: "map", text: "Is this everything this page should have, and is anything here that you do not want?" })
  if (s.ownerQuestions) asks.push({ kind: "question", text: `${s.ownerQuestions} question${s.ownerQuestions === 1 ? "" : "s"} about what you want that only you can answer` })
  if (s.tasteFindings) asks.push({ kind: "taste", text: `${s.tasteFindings} thing${s.tasteFindings === 1 ? "" : "s"} that work but may not look the way you like` })
  if (s.planWaiting) asks.push({ kind: "plan", text: `${s.planWaiting} change${s.planWaiting === 1 ? "" : "s"} to what you planned` })
  if (s.cleared && !s.signedOff) asks.push({ kind: "feel", text: "Everything works and has been checked. Does the flow do what you need, and do you like how it feels?" })
  return asks
}
