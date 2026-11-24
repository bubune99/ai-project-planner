import { lawsAt } from "../gates/ux-laws"
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
  /** The page it happened on, when it differs from where the walk began. */
  route?: string
  /** The control pressed, by its label as the page's checklist names it: a walk's press clears that control's function check. */
  control?: { label: string; kind?: string }
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
/** The Laws of UX a lens is judged by (lib/gates/ux-laws.ts), named beside its score and in the fix it asks for. */
export const lensLaws = (lens: Lens): string[] => lawsAt(`walk:${lens}`)
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
  /** The owner's call on a finding that was theirs: change it (it becomes a task for agents) or leave it as it is. */
  settled?: Settled
  /** An agent fixed it and proved the fix (a build, a page, what was seen). A walk after this that meets it again reopens it. */
  fixed?: Fixed
}
/** Only the owner settles a finding, and only from a signed-in session. An agent sending a walk cannot set this. */
export interface Settled { call: "do" | "leave"; at: string; task?: string }
/** A fix an agent made and proved. Not a preference: anything an agent may fix, it may also say it fixed, with proof. */
export interface Fixed { at: string; proof: string; by: "agent" | "owner" }
/** What makes two findings the same finding: its kind and its words. */
export const findingKey = (f: Pick<Finding, "kind" | "what">): string => `${f.kind}|${f.what.toLowerCase()}`
/** A walk with every finding of that key settled (or, with null, put back to open). A new walk: nothing is changed in place. */
export function settleIn<W extends Walk>(walk: W, key: string, settled: Settled | null): W {
  return { ...walk, findings: walk.findings.map((f) => {
    if (findingKey(f) !== key) return f
    const { settled: _was, ...rest } = f
    return settled ? { ...rest, settled } : rest
  }) }
}
/** A walk as an agent may send it: whatever it says about the owner's calls is dropped. */
export const withoutCalls = <W extends Walk>(walk: W): W => ({ ...walk, findings: walk.findings.map(({ settled: _s, fixed: _f, ...rest }) => rest) })
/** A walk with every finding of that key marked fixed (or, with null, put back to open). A new walk: nothing is changed in place. */
export function fixIn<W extends Walk>(walk: W, key: string, fixed: Fixed | null): W {
  return { ...walk, findings: walk.findings.map((f) => {
    if (findingKey(f) !== key) return f
    const { fixed: _was, ...rest } = f
    return fixed ? { ...rest, fixed } : rest
  }) }
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
  /** A partial walk: the ids of the use case's steps it walked. Without it, the whole main line (or the way below). */
  covers?: string[]
  /** The way through it took (a step's way in People and flows). Rules in step-coverage.ts. */
  way?: string
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
  if (f.kind === "friction" && low) { const laws = lensLaws(f.lens!); return { who: "agents", how: `${LENS[f.lens!].name} scored ${scores![f.lens!]!.score} of 5: a fix, not a preference. Fixed and proved by agents.${laws.length ? ` Judged by ${laws.join(", ")}.` : ""}` } }
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
    const route = typeof r.route === "string" && r.route.startsWith("/") ? r.route.slice(0, 300) : undefined
    const c = (r.control && typeof r.control === "object" ? r.control : null) as Record<string, unknown> | null
    const label = c ? text(c.label).slice(0, 200) : ""
    const control = label ? { label, ...(typeof c?.kind === "string" && c.kind ? { kind: c.kind.slice(0, 40) } : {}) } : undefined
    const step: WalkStep = { did: text(r.did), expected: text(r.expected), saw: text(r.saw), ok: r.ok !== false, ...(route ? { route } : {}), ...(control ? { control } : {}) }
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
    const s = (r.settled && typeof r.settled === "object" ? r.settled : null) as Record<string, unknown> | null
    const settled: Settled | undefined = s && (s.call === "do" || s.call === "leave") && typeof s.at === "string" ? { call: s.call, at: s.at, ...(typeof s.task === "string" ? { task: s.task } : {}) } : undefined
    const x = (r.fixed && typeof r.fixed === "object" ? r.fixed : null) as Record<string, unknown> | null
    const fixed: Fixed | undefined = x && typeof x.at === "string" && typeof x.proof === "string" ? { at: x.at, proof: x.proof, by: x.by === "owner" ? "owner" : "agent" } : undefined
    return { kind: kind ?? "friction", what, ...(lens ? { lens } : {}), ...(step !== undefined ? { step } : {}), ...(suggest ? { suggest } : {}), ...(settled ? { settled } : {}), ...(fixed ? { fixed } : {}) }
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
  const opt = (k: "useCase" | "persona" | "route" | "env" | "build" | "way") => { const v = text(o[k]); return v ? { [k]: v } : {} }
  const covers = [...new Set(list(o.covers, 80).filter((x): x is string => typeof x === "string" && /^[\w-]{1,80}$/.test(x)))]
  if (covers.length && !text(o.useCase)) errors.push("A walk of some steps names the use case they belong to")
  return { walk: { goal, ...opt("useCase"), ...opt("persona"), ...opt("route"), cold: o.cold === true, outcome, ...(why ? { why } : {}), steps, findings, ...(Object.keys(scores).length ? { scores } : {}), ...opt("env"), ...opt("build"), ...(covers.length ? { covers } : {}), ...opt("way") }, errors }
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

/**
 * What a set of walks leaves open, newest walk first: each finding once, with who deals with it.
 * The owner's call on a finding holds for every walk that met it, later ones included: left as it is, it is no longer
 * open; to be changed, it is the agents' work.
 */
export function openFindings(walks: StoredWalk[]): (Finding & { walk: string; goal: string; who: "agents" | "owner" })[] {
  const calls = new Map<string, Settled>(), fixes = new Map<string, Fixed>()
  for (const w of walks) for (const f of w.findings) {
    const k = findingKey(f), had = calls.get(k), fx = fixes.get(k)
    if (f.settled && (!had || f.settled.at > had.at)) calls.set(k, f.settled)
    if (f.fixed && (!fx || f.fixed.at > fx.at)) fixes.set(k, f.fixed)
  }
  const seen = new Set<string>(), out: (Finding & { walk: string; goal: string; who: "agents" | "owner" })[] = []
  for (const w of [...walks].sort((a, b) => b.at.localeCompare(a.at))) for (const f of w.findings) {
    const key = findingKey(f)
    if (seen.has(key)) continue
    seen.add(key)
    const call = calls.get(key)
    if (call?.call === "leave") continue
    // Fixed and proved: closed, unless this (newest) walk that met it came after the fix, which means it is back.
    const fix = fixes.get(key)
    if (fix && fix.at >= w.at) continue
    out.push({ ...f, ...(call ? { settled: call } : {}), walk: w.id, goal: w.goal, who: call?.call === "do" ? "agents" : handledBy(f, w.scores).who })
  }
  return out
}
