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
    const base = [v.key, c.kind, norm(c.label)].join(SEP), k = (seen.get(base) ?? 0) + 1
    seen.set(base, k)
    out.set(c, `${base}${SEP}${k}`)
  }
  return out
}

/** What is asked of a control, apart from where it sits and what the last scan thought of it. */
const criteria = (c: Control) => JSON.stringify([c.states, c.workflows])

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
  const ref = new Map(allChecks(list).map((c) => [c.key, c]))
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
  for (const c of allChecks(list)) {
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

export interface IntakeQuestion { id: string; ask: string; why: string }

const Q = (id: string, ask: string, why: string): IntakeQuestion => ({ id, ask, why })
const ALWAYS = [
  Q("purpose", "What is it for? What could someone not do without it?", "A thing with no purpose anyone can state should not be built."),
  Q("who", "Who uses it, and who must not be able to?", "This decides what each kind of person sees and what is refused."),
  Q("flow", "Which use case is it part of, and what comes just before and just after it?", "A control checked alone can pass while the journey it belongs to is broken."),
]
const CONTENT = [
  Q("source", "Is this typed in by someone, or worked out from something else?", "What is typed needs a way to change it. What is worked out must never be typed over."),
  Q("from", "If it is worked out: from what, and when does it change?", "This is what the figure is checked against."),
  Q("empty", "What shows when there is nothing yet?", "An empty state nobody designed is a blank or a wrong zero."),
]
const BY_KIND: Record<string, IntakeQuestion[]> = {
  Field: [Q("kept", "What happens to what is typed: where is it kept, and what else changes because of it?", "This is the action check for the field."), Q("refused", "What must be refused, and what does the person see then?", "Limits nobody stated are limits nobody checks.")],
  Button: [Q("changes", "What does pressing it change?", "This is the action check for the button."), Q("undo", "Can it be undone? If not, is the person asked first?", "Anything that cannot be undone is the owner's to approve.")],
  Switch: [Q("changes", "What is different when it is on?", "This is the action check for the switch.")],
  Tab: [Q("changes", "What does it show that the other tabs do not?", "Tabs that show the same thing are one tab.")],
  Link: [],
  Text: CONTENT,
  Card: [...CONTENT, Q("order", "What is the most important thing in it, and is that the first thing seen?", "This is what its layout is judged against.")],
  Chart: [...CONTENT, Q("agrees", "Which figures elsewhere must it agree with?", "A chart is right only if it matches the numbers it is drawn from.")],
}

/** The questions to settle about a planned item, by what kind of thing it is. */
export function intakeQuestions(kind: string | undefined): IntakeQuestion[] {
  return [...ALWAYS, ...(BY_KIND[kind ?? ""] ?? BY_KIND.Button)]
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
}

/** How far the questions about a page's planned items have been answered. */
export function intakeStatus(items: Expected[]): IntakeStatus {
  const s: IntakeStatus = { items: items.length, questions: 0, settled: 0, reasoned: 0, proposed: 0, missing: 0, open: [] }
  for (const it of items) for (const q of intakeQuestions(it.kind)) {
    const a = it.answers?.[q.id], st = answerState(a)
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
