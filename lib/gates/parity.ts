/**
 * Parity: two saved checklists for the same screen, set side by side (card 6dc6c67a, first slice).
 *
 * Owner, 2026-11-15: "taking code from one project to another with feature parity is a huge thing that has bitten
 * me a lot". A page's checklist is already the written list of what a screen has and what each control must do.
 * This puts one project's list against its sibling's and says, for every control: in both and the same, in both
 * but different (and what differs), or in one only (and which).
 *
 * Pure: no database, no React, no clock. Neither checklist is changed.
 *
 * What makes two controls the same control: the view they are in, and their name (capitals and spacing aside).
 * What is compared once they are matched: what kind of thing each is, the states each is checked in, and each
 * workflow (what it proves, where it starts, every step and what must be there or gone after it).
 * What is not compared: where a control sits, its number, what a scan found wrong with it, whether its workflows
 * are still the scanner's draft, and whether it is on every page. Those are facts about one build, not about what
 * the feature is.
 */
import type { Checklist, Control, Step, Workflow, WorkflowKind } from "./gate-model"

/** One side's control: enough to find it in that project's checklist. */
export interface ParityControl { n: number; label: string; kind: string }

export interface ParityDiff {
  /** kind: another kind of thing. states / workflows: one has some the other lacks. proves, before, steps: one workflow, written differently. */
  what: "kind" | "states" | "workflows" | "proves" | "before" | "steps"
  /** The workflow this is about, for proves, before and steps. */
  workflow?: string
  /** For states and workflows: the names each side has that the other lacks. */
  onlyA?: string[]
  onlyB?: string[]
  /** For kind: each side's. */
  a?: string
  b?: string
  /** The difference in words. */
  say: string
}

interface RowBase { view: string; label: string; a?: ParityControl; b?: ParityControl }
export type ParityRow =
  | (RowBase & { status: "same"; a: ParityControl; b: ParityControl })
  | (RowBase & { status: "different"; a: ParityControl; b: ParityControl; differs: ParityDiff[] })
  | (RowBase & { status: "only"; side: "a" | "b" })

export interface Parity {
  /** Both checklists are for the same route. When false, the caller chose to compare two different screens. */
  sameRoute: boolean
  /** One row per control: A's in A's order, then what only B has in B's order. */
  rows: ParityRow[]
  same: number
  different: number
  onlyA: number
  onlyB: number
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const proves = (w: Workflow): WorkflowKind => w.kind ?? "function"
const names = (xs: string[] | undefined) => (xs ?? []).map(norm)
const sameNames = (x: string[] | undefined, y: string[] | undefined) => names(x).join("\n") === names(y).join("\n")
const listed = (xs: string[] | undefined) => (xs?.length ? xs.join(", ") : "nothing")
const quoted = (s: string | undefined) => (s?.trim() ? `"${s.trim()}"` : "nothing stated")
const article = (kind: string) => (/^[aeiou]/i.test(kind) ? "an" : "a")

/** Names in `xs` that `ys` lacks, capitals and spacing aside, as written in `xs`. */
function lacking(xs: string[], ys: string[]): string[] {
  const has = new Set(ys.map(norm))
  return xs.filter((x) => !has.has(norm(x)))
}

function stepDiffs(name: string, i: number, a: Step, b: Step): ParityDiff[] {
  const at = `"${name}", step ${i + 1}`
  const out: ParityDiff[] = []
  const say = (text: string) => out.push({ what: "steps", workflow: name, say: `${at}: ${text}` })
  if (norm(a.do) !== norm(b.do)) say(`A does "${a.do}", B does "${b.do}"`)
  if (norm(a.expect) !== norm(b.expect)) say(`A expects "${a.expect}", B expects "${b.expect}"`)
  if (!sameNames(a.there, b.there)) say(`must be there in A: ${listed(a.there)}; in B: ${listed(b.there)}`)
  if (!sameNames(a.gone, b.gone)) say(`must be gone in A: ${listed(a.gone)}; in B: ${listed(b.gone)}`)
  return out
}

function workflowDiffs(a: Workflow, b: Workflow): ParityDiff[] {
  const out: ParityDiff[] = []
  if (proves(a) !== proves(b)) out.push({ what: "proves", workflow: a.name, say: `"${a.name}" proves ${proves(a)} in A and ${proves(b)} in B` })
  if (norm(a.before ?? "") !== norm(b.before ?? "")) out.push({ what: "before", workflow: a.name, say: `"${a.name}" starts from ${quoted(a.before)} in A and from ${quoted(b.before)} in B` })
  if (a.steps.length !== b.steps.length) out.push({ what: "steps", workflow: a.name, say: `"${a.name}" has ${a.steps.length} step${a.steps.length === 1 ? "" : "s"} in A and ${b.steps.length} in B` })
  else a.steps.forEach((s, i) => out.push(...stepDiffs(a.name, i, s, b.steps[i])))
  return out
}

/** What differs between two controls already known to be the same control. Empty means nothing does. */
function controlDiffs(a: Control, b: Control): ParityDiff[] {
  const out: ParityDiff[] = []
  if (norm(a.kind) !== norm(b.kind)) out.push({ what: "kind", a: a.kind, b: b.kind, say: `It is ${article(a.kind)} ${a.kind} in A and ${article(b.kind)} ${b.kind} in B` })
  const oneSided = (what: "states" | "workflows", word: string, xs: string[], ys: string[]) => {
    const onlyA = lacking(xs, ys), onlyB = lacking(ys, xs)
    // One entry when a single side has extras; one per side when both do, so each line reads on its own.
    if (onlyA.length && onlyB.length) {
      out.push({ what, onlyA, onlyB: [], say: `${word} only in A: ${onlyA.join(", ")}` })
      out.push({ what, onlyA: [], onlyB, say: `${word} only in B: ${onlyB.join(", ")}` })
    } else if (onlyA.length || onlyB.length) out.push({ what, onlyA, onlyB, say: `${word} only in ${onlyA.length ? "A" : "B"}: ${(onlyA.length ? onlyA : onlyB).join(", ")}` })
  }
  oneSided("states", "States", a.states, b.states)
  oneSided("workflows", "Workflows", a.workflows.map((w) => w.name), b.workflows.map((w) => w.name))
  for (const w of a.workflows) {
    const other = b.workflows.find((x) => norm(x.name) === norm(w.name))
    if (other) out.push(...workflowDiffs(w, other))
  }
  return out
}

/**
 * Two checklists for the same screen, control by control. A is usually the project the feature comes from and B
 * the one receiving it, but the comparison does not depend on which is which.
 *
 * Matching, in order: the same view, name and kind; then the same view and name with another kind (one control
 * that differs in kind, rather than one missing and one extra). Several controls with the same name in a view
 * pair off in the order they appear, and any left over are in one only.
 */
export function compareChecklists(a: Checklist, b: Checklist): Parity {
  const flat = (l: Checklist) => (l.views ?? []).flatMap((v) => (v.controls ?? []).map((c) => ({ view: v.key, c })))
  const as = flat(a), bs = flat(b)
  const taken = new Set<number>()
  const pair = new Map<number, number>()
  const match = (sameKind: boolean) => as.forEach((x, i) => {
    if (pair.has(i)) return
    const j = bs.findIndex((y, k) => !taken.has(k) && y.view === x.view && norm(y.c.label) === norm(x.c.label) && (!sameKind || norm(y.c.kind) === norm(x.c.kind)))
    if (j >= 0) { pair.set(i, j); taken.add(j) }
  })
  match(true)
  match(false)

  const side = (c: Control): ParityControl => ({ n: c.n, label: c.label, kind: c.kind })
  const rows: ParityRow[] = as.map((x, i): ParityRow => {
    const j = pair.get(i)
    if (j === undefined) return { status: "only", side: "a", view: x.view, label: x.c.label, a: side(x.c) }
    const y = bs[j], differs = controlDiffs(x.c, y.c)
    const base = { view: x.view, label: x.c.label, a: side(x.c), b: side(y.c) }
    return differs.length ? { status: "different", ...base, differs } : { status: "same", ...base }
  })
  bs.forEach((y, k) => { if (!taken.has(k)) rows.push({ status: "only", side: "b", view: y.view, label: y.c.label, b: side(y.c) }) })

  const count = (test: (r: ParityRow) => boolean) => rows.filter(test).length
  return {
    sameRoute: a.route === b.route,
    rows,
    same: count((r) => r.status === "same"),
    different: count((r) => r.status === "different"),
    onlyA: count((r) => r.status === "only" && r.side === "a"),
    onlyB: count((r) => r.status === "only" && r.side === "b"),
  }
}

const few = (labels: string[]) => (labels.length <= 4 ? labels.join(", ") : `${labels.slice(0, 4).join(", ")} and ${labels.length - 4} more`)

/** The comparison in one line, naming what has to be looked at. `nameA` and `nameB` are the two projects. */
export function parityLine(p: Parity, nameA = "A", nameB = "B"): string {
  if (!p.rows.length) return "Neither has any controls."
  const labels = (test: (r: ParityRow) => boolean) => few(p.rows.filter(test).map((r) => r.label))
  const parts: string[] = []
  if (p.same) parts.push(`${p.same} the same`)
  if (p.different) parts.push(`${p.different} in both but different (${labels((r) => r.status === "different")})`)
  if (p.onlyA) parts.push(`${p.onlyA} only in ${nameA} (${labels((r) => r.status === "only" && r.side === "a")})`)
  if (p.onlyB) parts.push(`${p.onlyB} only in ${nameB} (${labels((r) => r.status === "only" && r.side === "b")})`)
  return `${parts.join("; ")}.`
}
