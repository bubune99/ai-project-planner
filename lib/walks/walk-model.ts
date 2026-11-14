/**
 * Walks: an agent given a goal uses the product the way a person would, and
 * writes down what happened. A script checks what it was told to check; a walk
 * finds what nobody thought to ask for: the step that is missing, the action
 * that could not be found, the place a person would give up.
 *
 * A walk is a goal, the steps actually taken (wrong turns included), how it
 * ended, and what was found. Each finding is one of four kinds, and the kind
 * decides who deals with it.
 *
 * Pure: no React, no database, no clock. Checked by walk-model.assert.ts.
 */

export type FindingKind = "error" | "gap" | "friction" | "taste"
export type Outcome = "reached" | "blocked" | "gave_up"

export interface WalkStep {
  /** What was done, as a person would say it: "pressed Add a transaction". */
  did: string
  /** What the walker expected to happen, decided before doing it. */
  expected: string
  /** What actually happened. */
  saw: string
  /** Did it go as expected. */
  ok: boolean
}
/**
 * The six things every screen a person uses is judged on (the human-centered audit). Each is scored 1 to 5 on a walk.
 * Below 3 on any of them is a fix, not something to ship.
 */
export const LENSES = ["back", "find", "across", "assist", "density", "consistent"] as const
export type Lens = (typeof LENSES)[number]
export const LENS: Record<Lens, { name: string; asks: string; five: string; one: string }> = {
  back: { name: "Getting back", asks: "How do I get back to where I was?", five: "A visible way back that restores where I was: scroll, selection, half-finished work", one: "No way back; what I was doing is lost" },
  find: { name: "Finding the action", asks: "How do I do the thing I came for?", five: "The main action is the most prominent thing, named in my words", one: "It is not on this screen at all, or only behind a right-click or a shortcut" },
  across: { name: "Getting elsewhere", asks: "How do I get to the screen I need next?", five: "Every next place is one click away, and search reaches anything", one: "I have to go home first, or know where to look" },
  assist: { name: "Help from the assistant", asks: "How can the assistant help me here?", five: "It is in view, knows this screen and what I selected, and can do the main actions for me", one: "There is no assistant on this screen" },
  density: { name: "How full it is", asks: "Is this crowded, just right, or empty?", five: "Content fills the space it has without crowding; nothing squeezed, no dead area", one: "Overwhelming, or abandoned" },
  consistent: { name: "Feels like the same product", asks: "Is this built from the same parts as the rest?", five: "Shared parts, spacing and colors throughout", one: "Looks like a different product" },
}
export interface LensScore { score: number; note: string }
/** Below this, a score is a fix and not a preference. */
export const SHIP_FLOOR = 3

export interface Finding {
  kind: FindingKind
  what: string
  /** Which of the six it is about, when it is about one. */
  lens?: Lens
  /** The step it was met at (0-based), when it belongs to one. */
  step?: number
  /** What would have made it work, when the walker has an idea. */
  suggest?: string
}
export interface Walk {
  goal: string
  /** Ids from the project's People and flows, when the goal is one of its use cases. */
  useCase?: string; persona?: string
  /** Where the walk began. */
  route?: string
  /** The walker had not read the code or been told the way: only then does "could not find it" mean anything. */
  cold: boolean
  outcome: Outcome
  /** Why it stopped short. Required unless the goal was reached. */
  why?: string
  steps: WalkStep[]
  findings: Finding[]
  /** How the screens walked through did on each of the six. Not every walk scores all of them. */
  scores?: Partial<Record<Lens, LensScore>>
  env?: string; build?: string
}

export const KIND_WORD: Record<FindingKind, string> = {
  error: "Broken",
  gap: "Something needed is not there",
  friction: "It works, but it is hard",
  taste: "A matter of taste",
}
/**
 * Who deals with a finding. Something broken is fixed by agents and never put to the owner. Something missing is a
 * proposal about what the product should have: an agent adds it to the plan as not built, and the planner's own rules
 * say whether the owner must be asked. Something hard, or a matter of taste, comes to the owner with a proposal.
 */
/**
 * Who deals with one finding on one walk. As HANDLED_BY, with one exception: something hard about a thing that scored
 * below the floor is a fix for agents, not a preference for the owner. Nobody is asked whether they would like a way back.
 */
export function handledBy(f: Finding, scores?: Partial<Record<Lens, LensScore>>): { who: "agents" | "owner"; how: string } {
  const low = f.lens && scores?.[f.lens] && scores[f.lens]!.score < SHIP_FLOOR
  if (f.kind === "friction" && low) return { who: "agents", how: `${LENS[f.lens!].name} scored ${scores![f.lens!]!.score} of 5: a fix, not a preference. Fixed and proved by agents.` }
  return HANDLED_BY[f.kind]
}
/** The six, lowest first, for a walk that scored any. */
export const lowScores = (w: Walk): { lens: Lens; score: number; note: string }[] =>
  LENSES.flatMap((l) => (w.scores?.[l] ? [{ lens: l, ...w.scores[l]! }] : [])).sort((a, b) => a.score - b.score)

export const HANDLED_BY: Record<FindingKind, { who: "agents" | "owner"; how: string }> = {
  error: { who: "agents", how: "Fixed and proved by agents. Not a question for the owner." },
  gap: { who: "agents", how: "Added to the use case as a step that is not built, and proposed as a change to the plan." },
  friction: { who: "owner", how: "Put to the owner as a preference, with what the walker would change." },
  taste: { who: "owner", how: "The owner's to judge." },
}

const LIMITS = { steps: 80, findings: 60, text: 400 }
const KINDS: FindingKind[] = ["error", "gap", "friction", "taste"], OUTCOMES: Outcome[] = ["reached", "blocked", "gave_up"]

/** Reads a walk sent by an agent: keeps the known fields, trims the text, and says what is wrong with it. */
export function parseWalk(raw: unknown): { walk: Walk; errors: string[] } {
  const errors: string[] = []
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LIMITS.text) : "")
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
  const goal = text(o.goal)
  if (!goal) errors.push("A walk needs a goal: what the person set out to do")
  const outcome = OUTCOMES.find((x) => x === o.outcome) ?? "blocked"
  if (!OUTCOMES.includes(o.outcome as Outcome)) errors.push("Say how it ended: reached, blocked or gave_up")
  const steps = list(o.steps, LIMITS.steps).map((s, i) => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>
    const step = { did: text(r.did), expected: text(r.expected), saw: text(r.saw), ok: r.ok !== false }
    if (!step.did || !step.saw) errors.push(`Step ${i + 1} needs what was done and what was seen`)
    return step
  })
  if (!steps.length) errors.push("A walk with no steps is not a walk")
  const findings = list(o.findings, LIMITS.findings).map((f, i) => {
    const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>
    const kind = KINDS.find((k) => k === r.kind)
    if (!kind) errors.push(`Finding ${i + 1} needs a kind: error, gap, friction or taste`)
    const what = text(r.what)
    if (!what) errors.push(`Finding ${i + 1} does not say what was found`)
    const step = Number.isInteger(r.step) && (r.step as number) >= 0 && (r.step as number) < steps.length ? (r.step as number) : undefined
    const suggest = text(r.suggest), lens = LENSES.find((l) => l === r.lens)
    return { kind: kind ?? "friction", what, ...(lens ? { lens } : {}), ...(step !== undefined ? { step } : {}), ...(suggest ? { suggest } : {}) }
  })
  const scores: Partial<Record<Lens, LensScore>> = {}
  const rawScores = (o.scores && typeof o.scores === "object" && !Array.isArray(o.scores) ? o.scores : {}) as Record<string, unknown>
  for (const lens of LENSES) {
    const r = rawScores[lens]
    if (r === undefined || r === null) continue
    const v = (typeof r === "object" ? r : {}) as Record<string, unknown>, note = text(v.note)
    if (!Number.isInteger(v.score) || (v.score as number) < 1 || (v.score as number) > 5) { errors.push(`${LENS[lens].name}: the score is a whole number from 1 to 5`); continue }
    if (!note) errors.push(`${LENS[lens].name}: a score says what was seen that earned it`)
    scores[lens] = { score: v.score as number, note }
    // A low score with nothing written against it is a number nobody can act on.
    if ((v.score as number) < SHIP_FLOOR && !findings.some((f) => f.lens === lens)) errors.push(`${LENS[lens].name} scored ${v.score}: below ${SHIP_FLOOR} is a fix, so name what is wrong as a finding about it`)
  }
  const why = text(o.why)
  if (outcome !== "reached" && !why) errors.push("A walk that did not reach its goal says why it stopped")
  // Stopping short without a finding means the reason was never written down where anyone will act on it.
  if (outcome !== "reached" && !findings.some((f) => f.kind === "error" || f.kind === "gap" || f.kind === "friction")) errors.push("A walk that did not reach its goal records what stopped it as a finding")
  if (outcome === "reached" && steps.length && !steps[steps.length - 1].ok) errors.push("The last step did not go as expected, so the goal was not reached")
  const opt = (k: "useCase" | "persona" | "route" | "env" | "build") => { const v = text(o[k]); return v ? { [k]: v } : {} }
  return { walk: { goal, ...opt("useCase"), ...opt("persona"), ...opt("route"), cold: o.cold === true, outcome, ...(why ? { why } : {}), steps, findings, ...(Object.keys(scores).length ? { scores } : {}), ...opt("env"), ...opt("build") }, errors }
}

/** A walk in one line. */
export function walkLine(w: Walk): string {
  const wrong = w.steps.filter((s) => !s.ok).length, n = w.steps.length
  const end = w.outcome === "reached" ? `Reached the goal in ${n} step${n === 1 ? "" : "s"}` : w.outcome === "blocked" ? `Blocked after ${n} step${n === 1 ? "" : "s"}` : `Gave up after ${n} step${n === 1 ? "" : "s"}`
  const by = KINDS.map((k) => [k, w.findings.filter((f) => f.kind === k).length] as const).filter(([, c]) => c)
  const found = by.length ? by.map(([k, c]) => `${c} ${k === "gap" ? (c === 1 ? "gap" : "gaps") : k === "error" ? (c === 1 ? "error" : "errors") : k === "friction" ? "hard" : "taste"}`).join(", ") : "nothing found"
  const low = lowScores(w).filter((x) => x.score < SHIP_FLOOR)
  return `${end}${wrong ? `, ${wrong} not as expected` : ""}: ${found}.${low.length ? ` Below the line: ${low.map((x) => `${LENS[x.lens].name.toLowerCase()} ${x.score}`).join(", ")}.` : ""}`
}

export interface StoredWalk extends Walk { id: string; at: string; actor: "agent" | "owner" }
export interface Coverage { useCase: string; name: string; walks: number; last: StoredWalk | null; state: "never" | "stale" | "reached" | "stopped" }
/**
 * Which use cases have been walked. "stale" means the last walk was on a different build from the one in question,
 * so what it proved may no longer hold.
 */
export function coverage(useCases: { id: string; name: string }[], walks: StoredWalk[], build?: string): Coverage[] {
  return useCases.map((u) => {
    const mine = walks.filter((w) => w.useCase === u.id).sort((a, b) => b.at.localeCompare(a.at)), last = mine[0] ?? null
    const state: Coverage["state"] = !last ? "never" : build && last.build && last.build !== build ? "stale" : last.outcome === "reached" ? "reached" : "stopped"
    return { useCase: u.id, name: u.name, walks: mine.length, last, state }
  })
}

/** What a set of walks leaves open, newest walk first: each finding once, with who deals with it. */
export function openFindings(walks: StoredWalk[]): (Finding & { walk: string; goal: string; who: "agents" | "owner" })[] {
  const seen = new Set<string>(), out: (Finding & { walk: string; goal: string; who: "agents" | "owner" })[] = []
  for (const w of [...walks].sort((a, b) => b.at.localeCompare(a.at))) for (const f of w.findings) {
    const key = `${f.kind}|${f.what.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...f, walk: w.id, goal: w.goal, who: handledBy(f, w.scores).who })
  }
  return out
}
