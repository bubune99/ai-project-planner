/**
 * How the system works, as data: who does what (lanes), in which stage
 * (columns), the lines forward and the loops back, and the loop inside each
 * stage. The picture is drawn from this, so the map cannot drift from the
 * process it describes; the numbers on it are the project's own, passed in.
 *
 * Pure: no React, no database. Checked by process-map.assert.ts.
 */

export interface MapNumbers {
  /** Intent questions answered, of how many. */
  answered: number; questions: number
  /** Rules in force when code is written. */
  rules: number
  /** Things the scan listed on the page. */
  items: number
  confirmed: number; dismissed: number; waiting: number
  /** Matters of taste waiting for the owner. */
  taste: number
  /** Fixes a second look sent back. */
  secondLook: number
  cleared: number; total: number
}

export const LANES = ["You", "Planning agent", "Builder agent", "The scan (a script)", "Reviewer agent", "The planner's record"] as const
export type StageId = "plan" | "intent" | "build" | "scan" | "validate" | "fix" | "finish"
export type Loop = "top" | "top2" | "left" | "bottom"

export interface Stage { id: StageId; title: string; sub: string }
export interface MapStep { id: string; stage: StageId; lane: number; title: string; sub: string; todo?: boolean }
export interface Link { from: string; to: string; label?: string; loop?: Loop }
export interface SubNode { id: string; title: string; sub: string; who: string; todo?: boolean }
export interface SubFlow { say: string; nodes: SubNode[]; edges: Link[] }
export interface ProcessMap { lanes: readonly string[]; stages: Stage[]; steps: MapStep[]; links: Link[]; subs: Record<StageId, SubFlow> }

export function buildProcessMap(n: MapNumbers): ProcessMap {
  const S = (id: string, stage: StageId, lane: number, title: string, sub: string, todo?: boolean): MapStep => ({ id, stage, lane, title, sub, ...(todo ? { todo } : {}) })
  const E = (from: string, to: string, label?: string, loop?: Loop): Link => ({ from, to, ...(label ? { label } : {}), ...(loop ? { loop } : {}) })
  const N = (id: string, title: string, sub: string, who: string, todo?: boolean): SubNode => ({ id, title, sub, who, ...(todo ? { todo } : {}) })
  const stages: Stage[] = [
    { id: "plan", title: "1. Plan", sub: "Who it is for and what they come to do" },
    { id: "intent", title: "2. Intent", sub: `Why each thing is there. ${n.answered} of ${n.questions} answered` },
    { id: "build", title: "3. Build", sub: `Code, checked file by file against ${n.rules} rules` },
    { id: "scan", title: "4. Scan", sub: `The page mapped, with real screenshots. ${n.items} items` },
    { id: "validate", title: "5. Validate", sub: `${n.confirmed} confirmed, ${n.dismissed} dismissed, ${n.waiting} waiting` },
    { id: "fix", title: "6. Fix and prove", sub: "Each confirmed error fixed, then shown fixed" },
    { id: "finish", title: "7. Finish", sub: n.total > 0 && n.cleared === n.total ? "Passed" : `${n.cleared} of ${n.total} checks cleared` },
  ]
  const steps: MapStep[] = [
    S("say", "plan", 0, "Say what you want", "Who it is for, what they come to do"),
    S("draft", "plan", 1, "Draft people and use cases", "Not built yet", true),
    S("code", "intent", 2, "Answer what the code settles", "Where a figure comes from, what a button changes"),
    S("yours", "intent", 0, "Answer what only you know", "What it is for, who uses it"),
    S("write", "build", 2, "Write one file", ""),
    S("auto", "build", 3, "Automatic checks on that file", `${n.rules} rules in force`),
    S("map", "scan", 3, "Map the page", "Real screenshots, every menu and dialog"),
    S("claims", "scan", 5, "Record findings as claims", "Not yet counted"),
    S("look", "validate", 4, "Look at the real thing", `${n.waiting} waiting`),
    S("taste", "validate", 0, "Judge a matter of taste", `${n.taste} waiting for you`),
    S("fix", "fix", 2, "Fix the cause", "On a review branch"),
    S("second", "fix", 4, "Second look", `${n.secondLook} sent back so far`),
    S("cleared", "finish", 5, "Every check cleared?", `${n.cleared} of ${n.total}`),
    S("like", "finish", 0, "Is the flow right? Do you like it?", "The one question left to you"),
  ]
  const links: Link[] = [
    E("say", "draft"), E("draft", "code"), E("code", "yours"), E("yours", "write"), E("write", "auto"), E("auto", "map"), E("map", "claims"), E("claims", "look"),
    E("look", "fix", "an error"), E("look", "taste", "works, but you may not like it"), E("fix", "second"), E("second", "cleared"), E("taste", "like"), E("cleared", "like"),
    E("yours", "say", "an answer changes the plan", "top"), E("auto", "write", "failed: fix it now", "left"), E("second", "fix", "still wrong", "left"),
    E("cleared", "look", "not yet: round again", "bottom"), E("like", "say", "you want it different: back to the plan", "top2"),
  ]
  const subs: Record<StageId, SubFlow> = {
    plan: { say: "Loops until you say the plan is right.", nodes: [N("a", "Say what you want", "In your own words, or with a mock-up", "You"), N("b", "Draft people and use cases", "With the pointed follow-up questions", "Planning agent", true), N("c", "Correct the draft", "Edit any text, add or drop steps", "You"), N("d", "Plan recorded", "Every item with where it came from", "The planner")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("c", "b", "not right yet", "bottom")] },
    intent: { say: "Loops over every planned item until nothing is unanswered.", nodes: [N("a", "Ask each item its questions", "By what kind of thing it is", "The planner"), N("b", "Answer from the code", "Where a figure comes from, what a button changes", "Builder agent"), N("c", "Answer what only you know", "What it is for, who uses it", "You"), N("d", "Intent settled", "Each answer with who gave it and what it rests on", "The planner")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("c", "a", "next item", "bottom")] },
    build: { say: "Loops per file. A file that fails goes straight back.", nodes: [N("a", "Write one file", "", "Builder agent"), N("b", "Automatic checks", "Secrets, size, a caller check, your statements", "A script"), N("c", "Checks the agent performs", "Run it, call it, look at it", "Builder agent"), N("d", "File owes nothing", "Recorded with what was seen", "The record")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("b", "a", "failed: fix it now", "bottom"), E("d", "a", "next file", "top")] },
    scan: { say: "Loops over each menu and dialog the page can open.", nodes: [N("a", "Map the page", "Controls, words, cards, charts", "A script"), N("b", "Open each menu and dialog", "Screenshot it, list it, close it", "A script"), N("c", "Line up with what is known", "Same control, same number, same verdicts", "The planner"), N("d", "Findings recorded as claims", "Not yet counted", "The record")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("b", "b", "next opener", "bottom")] },
    validate: { say: "Loops over every claim. Three ways out, and only one of them reaches you.", nodes: [N("a", "Take the next claim", `${n.waiting} waiting`, "Reviewer agent"), N("b", "Look at the real thing", "A real screenshot, against the criterion", "Reviewer agent"), N("c", "Confirmed: an error", "Goes to be fixed. Not to you", "To stage 6"), N("d", "Dismissed: a false alarm", "With the reason, remembered next time", "The record"), N("e", "A matter of taste", `${n.taste} waiting for you`, "You")], edges: [E("a", "b"), E("b", "c", "an error"), E("b", "d", "not a problem", "top"), E("b", "e", "works, but you may not like it", "top"), E("e", "a", "next claim", "bottom")] },
    fix: { say: "Loops until a second look agrees it is fixed.", nodes: [N("a", "Find the cause in the code", "What was intended, and why it broke", "Builder agent"), N("b", "Fix it on a review branch", "", "Builder agent"), N("c", "Scan just that area again", "And what immediately surrounds it", "A script"), N("d", "Keep a proof screenshot", "", "Builder agent"), N("e", "Second look", `${n.secondLook} sent back so far`, "Reviewer agent")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("d", "e"), E("e", "a", "still wrong", "bottom")] },
    finish: { say: "The only loop that starts with you: a preference goes back to the plan.", nodes: [N("a", "Every check cleared?", `${n.cleared} of ${n.total}`, "The planner"), N("b", "Everything planned is there?", "And nothing unplanned", "The planner"), N("c", "Is the flow right? Do you like it?", "The one question left to you", "You"), N("d", "Passed", "The record is closed and kept", "The record")], edges: [E("a", "b"), E("b", "c"), E("c", "d"), E("a", "a", "not yet: back to the work", "bottom"), E("c", "a", "change it: to the plan, then round again", "top")] },
  }
  return { lanes: LANES, stages, steps, links, subs }
}

/** What is wrong with a map. Empty means it can be drawn without one box hiding another or a line going nowhere. */
export function checkMap(m: ProcessMap): string[] {
  const out: string[] = [], ids = new Set(m.steps.map((s) => s.id)), col = (id: string) => m.stages.findIndex((s) => s.id === m.steps.find((x) => x.id === id)!.stage)
  if (ids.size !== m.steps.length) out.push("Two steps share an id")
  const cells = new Set<string>()
  for (const s of m.steps) {
    const cell = `${s.stage}/${s.lane}`
    if (cells.has(cell)) out.push(`Two steps sit in the same place: ${cell}`)
    cells.add(cell)
    if (s.lane < 0 || s.lane >= m.lanes.length) out.push(`"${s.title}" is in a lane that does not exist`)
    if (!m.stages.some((g) => g.id === s.stage)) out.push(`"${s.title}" is in a stage that does not exist`)
  }
  for (const g of m.stages) {
    if (!m.steps.some((s) => s.stage === g.id)) out.push(`Stage ${g.title} has no steps`)
    const sub = m.subs[g.id]
    if (!sub || !sub.nodes.length) { out.push(`Stage ${g.title} has no loop to open`); continue }
    const subIds = new Set(sub.nodes.map((x) => x.id))
    for (const e of sub.edges) if (!subIds.has(e.from) || !subIds.has(e.to)) out.push(`Inside ${g.title}: a line joins a box that is not there`)
    if (!sub.edges.some((e) => e.loop)) out.push(`Inside ${g.title}: no loop is drawn`)
  }
  for (const e of m.links) {
    if (!ids.has(e.from) || !ids.has(e.to)) { out.push(`A line joins a step that is not there: ${e.from} to ${e.to}`); continue }
    const a = col(e.from), b = col(e.to)
    if (e.loop && b > a) out.push(`"${e.label}" is drawn as a loop but goes forward`)
    if (!e.loop && b < a) out.push(`The line ${e.from} to ${e.to} goes back but is not drawn as a loop`)
    if (e.loop && !e.label) out.push(`The loop ${e.from} to ${e.to} does not say why`)
  }
  for (const s of m.steps) if (s.id !== m.steps[0].id && !m.links.some((e) => e.to === s.id && !e.loop)) out.push(`Nothing leads to "${s.title}"`)
  return out
}

// ---- where things go ----

export const DIM = { laneLabel: 170, col: 268, node: 208, lane: 122, nodeH: 78, subGap: 320, subNode: 236, header: 140 }
export interface Point { x: number; y: number }

/** Where each step sits: its stage's column, its lane's row. */
export function placeSteps(m: ProcessMap): Record<string, Point> {
  const out: Record<string, Point> = {}
  for (const s of m.steps) out[s.id] = { x: DIM.laneLabel + m.stages.findIndex((g) => g.id === s.stage) * DIM.col + (DIM.col - DIM.node) / 2, y: s.lane * DIM.lane + (DIM.lane - 6 - DIM.nodeH) / 2 }
  return out
}
export const placeSub = (sub: SubFlow): Record<string, Point> => Object.fromEntries(sub.nodes.map((n, i) => [n.id, { x: i * DIM.subGap, y: 0 }]))

export type Side = "t" | "r" | "b" | "l"
/**
 * Which sides a line leaves and enters by, and how far it stands off. Forward lines leave by the right (or straight up
 * or down inside a column). Loops leave and come back by the same side, so they read as going round, and longer loops
 * stand further off so two never run on top of each other.
 */
export function routeLink(a: Point, b: Point, e: Link, inSub: boolean): { from: Side; to: Side; offset: number; loop: boolean } {
  const span = Math.round(Math.abs(a.x - b.x) / DIM.subGap)
  if (e.from === e.to) return { from: "b", to: "l", offset: 30, loop: true }
  // An arc that goes forward (a way out that skips a box) is routed like a loop but is not one.
  const back = b.x <= a.x
  if (e.loop === "left") return { from: "l", to: "l", offset: 26, loop: back }
  if (e.loop === "top" || e.loop === "top2") return { from: "t", to: "t", offset: e.loop === "top2" ? 46 : 20 + (inSub ? span * 12 : 0), loop: back }
  if (e.loop) return { from: "b", to: "b", offset: 24 + (inSub ? span * 12 : 6), loop: back }
  if (b.x > a.x + 1) return { from: "r", to: "l", offset: 20, loop: false }
  return b.y > a.y ? { from: "b", to: "t", offset: 20, loop: false } : { from: "t", to: "b", offset: 20, loop: false }
}
