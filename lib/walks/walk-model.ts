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
export interface Finding {
  kind: FindingKind
  what: string
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
    const suggest = text(r.suggest)
    return { kind: kind ?? "friction", what, ...(step !== undefined ? { step } : {}), ...(suggest ? { suggest } : {}) }
  })
  const why = text(o.why)
  if (outcome !== "reached" && !why) errors.push("A walk that did not reach its goal says why it stopped")
  // Stopping short without a finding means the reason was never written down where anyone will act on it.
  if (outcome !== "reached" && !findings.some((f) => f.kind === "error" || f.kind === "gap" || f.kind === "friction")) errors.push("A walk that did not reach its goal records what stopped it as a finding")
  if (outcome === "reached" && steps.length && !steps[steps.length - 1].ok) errors.push("The last step did not go as expected, so the goal was not reached")
  const opt = (k: "useCase" | "persona" | "route" | "env" | "build") => { const v = text(o[k]); return v ? { [k]: v } : {} }
  return { walk: { goal, ...opt("useCase"), ...opt("persona"), ...opt("route"), cold: o.cold === true, outcome, ...(why ? { why } : {}), steps, findings, ...opt("env"), ...opt("build") }, errors }
}

/** A walk in one line. */
export function walkLine(w: Walk): string {
  const wrong = w.steps.filter((s) => !s.ok).length, n = w.steps.length
  const end = w.outcome === "reached" ? `Reached the goal in ${n} step${n === 1 ? "" : "s"}` : w.outcome === "blocked" ? `Blocked after ${n} step${n === 1 ? "" : "s"}` : `Gave up after ${n} step${n === 1 ? "" : "s"}`
  const by = KINDS.map((k) => [k, w.findings.filter((f) => f.kind === k).length] as const).filter(([, c]) => c)
  const found = by.length ? by.map(([k, c]) => `${c} ${k === "gap" ? (c === 1 ? "gap" : "gaps") : k === "error" ? (c === 1 ? "error" : "errors") : k === "friction" ? "hard" : "taste"}`).join(", ") : "nothing found"
  return `${end}${wrong ? `, ${wrong} not as expected` : ""}: ${found}.`
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
    out.push({ ...f, walk: w.id, goal: w.goal, who: HANDLED_BY[f.kind].who })
  }
  return out
}
