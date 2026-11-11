/**
 * Flow-first planning: the shared flow contract (planner doc d56f1a28) as pure
 * functions. No database, no React, no clock: callers pass `now`.
 *
 * A flow lives in a planner document as one fenced ```flow JSON block. These
 * helpers read and write that block, check it against the contract, compare
 * versions, merge branches, apply the screenshot retention rule and compare a
 * verification run's observed clicks with the expected transitions.
 */

export type ActorKey = string

export interface Transition {
  trigger: string
  to: string
  condition?: string
}

export interface StepRules {
  money?: string
  permissions?: string
  notifications?: string
  edge_cases?: string
}

export interface FlowFeature {
  name: string
  status: "exists" | "new"
  task_id?: string
}

export interface FlowStep {
  id: string
  actor: ActorKey
  title?: string
  screen: string
  transitions: Transition[]
  rules?: StepRules
  decisions?: string[]
  features?: FlowFeature[]
}

export type FlowStatus = "draft" | "settled" | "built" | "verified"

export interface Flow {
  id: string
  version: number
  status: FlowStatus
  actors: ActorKey[]
  steps: FlowStep[]
  /** Step ids that were deleted. They are never reused. */
  retired?: string[]
  /** Branch key when this copy is a proposal, absent on main. */
  branch?: string
}

export interface Issue {
  level: "error" | "warning"
  where: string
  message: string
}

const FLOW_FENCE = /```flow\s*\n([\s\S]*?)\n```/

/** Reads the ```flow block from a document body. Null when there is none. */
export function parseFlowBlock(markdown: string): Flow | null {
  const m = FLOW_FENCE.exec(markdown)
  if (!m) return null
  const parsed = JSON.parse(m[1]) as Flow
  return { ...parsed, steps: parsed.steps ?? [], actors: parsed.actors ?? [] }
}

/** Returns the body with its ```flow block replaced (or appended when absent). */
export function writeFlowBlock(markdown: string, flow: Flow): string {
  const block = "```flow\n" + JSON.stringify(flow, null, 1) + "\n```"
  if (FLOW_FENCE.test(markdown)) return markdown.replace(FLOW_FENCE, () => block)
  return `${markdown.replace(/\s+$/, "")}\n\n${block}\n`
}

/** The letter prefix shared by a flow's step ids, e.g. "G" for G1…G11. */
export function stepPrefix(flow: Flow): string | null {
  const first = flow.steps[0]?.id.match(/^([A-Z]+)\d+$/)
  return first ? first[1] : null
}

/** Next unused step id, never reusing a retired one. */
export function nextStepId(flow: Flow): string {
  const prefix = stepPrefix(flow) ?? "S"
  const used = [...flow.steps.map((s) => s.id), ...(flow.retired ?? [])]
  const nums = used.map((id) => Number(id.replace(prefix, ""))).filter((n) => Number.isFinite(n))
  return `${prefix}${(nums.length ? Math.max(...nums) : 0) + 1}`
}

const RULE_KEYS: (keyof StepRules)[] = ["money", "permissions", "notifications", "edge_cases"]

/**
 * Checks a flow against the contract. Errors block saving; warnings block
 * marking the flow "settled".
 */
export function validateFlow(flow: Flow, opts: { openDecisionIds?: string[] } = {}): Issue[] {
  const issues: Issue[] = []
  const err = (where: string, message: string) => issues.push({ level: "error", where, message })
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message })

  if (!/^[a-z0-9-]+\.[a-z0-9-]+$/.test(flow.id)) err("flow", `id "${flow.id}" must look like project.flow-key`)
  if (!Number.isInteger(flow.version) || flow.version < 1) err("flow", "version must be a whole number from 1")

  const prefix = stepPrefix(flow)
  const ids = new Set<string>()
  for (const s of flow.steps) {
    if (!/^[A-Z]+\d+$/.test(s.id)) err(s.id, "step id must be a letter prefix and a number, e.g. G3")
    else if (prefix && !s.id.startsWith(prefix)) err(s.id, `step id must use the flow's prefix ${prefix}`)
    if (ids.has(s.id)) err(s.id, "duplicate step id")
    if ((flow.retired ?? []).includes(s.id)) err(s.id, "retired step ids cannot be reused")
    ids.add(s.id)
    if (!flow.actors.includes(s.actor)) err(s.id, `actor "${s.actor}" is not in the flow's actors`)
  }
  for (const s of flow.steps) {
    for (const t of s.transitions) {
      if (!ids.has(t.to)) err(s.id, `"${t.trigger}" leads to unknown step ${t.to}`)
    }
  }

  const reachable = new Set<string>(flow.steps[0] ? [flow.steps[0].id] : [])
  let grew = true
  while (grew) {
    grew = false
    for (const s of flow.steps) {
      if (!reachable.has(s.id)) continue
      for (const t of s.transitions) {
        if (!reachable.has(t.to)) {
          reachable.add(t.to)
          grew = true
        }
      }
    }
  }
  for (const s of flow.steps) {
    const enteredFromElsewhere = s.actor !== flow.steps[0]?.actor
    if (!reachable.has(s.id) && !enteredFromElsewhere) warn(s.id, "no step leads here")
  }

  const settling = flow.status !== "draft"
  for (const s of flow.steps) {
    const missing = RULE_KEYS.filter((k) => !s.rules?.[k])
    if (settling && s.rules && missing.length) warn(s.id, `rules missing: ${missing.join(", ")} (write "n/a" if none)`)
  }
  const open = (opts.openDecisionIds ?? []).filter((d) => flow.steps.some((s) => s.decisions?.includes(d)))
  if (settling && open.length) warn("flow", `${open.length} decision(s) still unanswered: ${open.join(", ")}`)
  return issues
}

export interface FlowDiff {
  added: string[]
  removed: string[]
  changed: { id: string; fields: string[] }[]
}

/** What a branch changes compared with main, by step id. */
export function diffFlows(main: Flow, branch: Flow): FlowDiff {
  const a = new Map(main.steps.map((s) => [s.id, s]))
  const b = new Map(branch.steps.map((s) => [s.id, s]))
  const added = [...b.keys()].filter((id) => !a.has(id))
  const removed = [...a.keys()].filter((id) => !b.has(id))
  const changed: FlowDiff["changed"] = []
  for (const [id, sb] of b) {
    const sa = a.get(id)
    if (!sa) continue
    const fields = (Object.keys({ ...sa, ...sb }) as (keyof FlowStep)[]).filter(
      (k) => JSON.stringify(sa[k] ?? null) !== JSON.stringify(sb[k] ?? null),
    )
    if (fields.length) changed.push({ id, fields: fields as string[] })
  }
  return { added, removed, changed }
}

/** Starts a proposal: a copy of main tagged with the branch key. */
export function branchFlow(main: Flow, key: string): Flow {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error("branch key must be lowercase letters, numbers and dashes")
  return { ...structuredClone(main), branch: key, status: "draft" }
}

/**
 * Accepting a branch: it becomes main at version+1. Removed step ids are
 * retired so they are never reused. Only the owner may call this; the tool
 * layer enforces who.
 */
export function mergeFlow(main: Flow, branch: Flow): Flow {
  if (branch.id !== main.id) throw new Error("branch belongs to a different flow")
  const { removed } = diffFlows(main, branch)
  const retired = [...new Set([...(main.retired ?? []), ...(branch.retired ?? []), ...removed])]
  const merged: Flow = { ...structuredClone(branch), version: main.version + 1, retired }
  delete merged.branch
  return merged
}

/** Decision ids referenced anywhere in the flow, in step order, without repeats. */
export function flowDecisionIds(flow: Flow): string[] {
  return [...new Set(flow.steps.flatMap((s) => s.decisions ?? []))]
}

// ---------------------------------------------------------------- verification

export interface ObservedClick {
  step: string
  trigger: string
  /** Step id the click landed on, or null when nothing happened. */
  landedOn: string | null
}

export interface CheckResult {
  step: string
  trigger: string
  expected: string[]
  actual: string | null
  ok: boolean
  problem?: "wrong destination" | "dead button" | "not in flow" | "not found on screen"
}

/**
 * Compares what the verification walk observed with the flow's transitions.
 * A trigger may lead to more than one step when conditions differ; landing on
 * any listed step passes.
 */
export function checkTransitions(flow: Flow, observed: ObservedClick[]): CheckResult[] {
  const results: CheckResult[] = []
  const seen = new Set<string>()
  for (const o of observed) {
    const step = flow.steps.find((s) => s.id === o.step)
    const expected = (step?.transitions ?? []).filter((t) => t.trigger === o.trigger).map((t) => t.to)
    seen.add(`${o.step}|${o.trigger}`)
    if (!expected.length) {
      results.push({ step: o.step, trigger: o.trigger, expected, actual: o.landedOn, ok: false, problem: "not in flow" })
    } else if (o.landedOn === null) {
      results.push({ step: o.step, trigger: o.trigger, expected, actual: null, ok: false, problem: "dead button" })
    } else {
      const ok = expected.includes(o.landedOn)
      results.push({ step: o.step, trigger: o.trigger, expected, actual: o.landedOn, ok, ...(ok ? {} : { problem: "wrong destination" as const }) })
    }
  }
  const walked = new Set(observed.map((o) => o.step))
  for (const s of flow.steps) {
    if (!walked.has(s.id)) continue
    for (const t of s.transitions) {
      const key = `${s.id}|${t.trigger}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ step: s.id, trigger: t.trigger, expected: [t.to], actual: null, ok: false, problem: "not found on screen" })
    }
  }
  return results
}

// ---------------------------------------------------------------- frames + retention

export type FrameKind = "words" | "wireframe" | "mockup" | "screenshot"

export interface Frame {
  id: string
  step: string
  kind: FrameKind
  env?: "staging" | "prod"
  capturedAt: string
  passed?: boolean
  /** Set while the failure it shows is unresolved. */
  openFinding?: boolean
  findingResolvedAt?: string
  pinned?: boolean
}

const DAY = 86_400_000

/**
 * The owner's retention rule (2026-11-11). Returns the ids to delete.
 * Kept: the latest passing screenshot per step and environment, failures until
 * resolved + 14 days, pinned ("training") frames, and every non-screenshot
 * frame (mock-ups/wireframes are cleared with their flow version, not by age).
 * Everything else expires after 30 days.
 */
export function framesToExpire(frames: Frame[], now: Date): string[] {
  const t = now.getTime()
  const latestPassing = new Map<string, Frame>()
  for (const f of frames) {
    if (f.kind !== "screenshot" || !f.passed) continue
    const key = `${f.step}|${f.env ?? ""}`
    const cur = latestPassing.get(key)
    if (!cur || f.capturedAt > cur.capturedAt) latestPassing.set(key, f)
  }
  const keepIds = new Set([...latestPassing.values()].map((f) => f.id))
  return frames
    .filter((f) => {
      if (f.kind !== "screenshot" || f.pinned || keepIds.has(f.id)) return false
      if (f.openFinding) return false
      if (f.findingResolvedAt) return t - new Date(f.findingResolvedAt).getTime() > 14 * DAY
      return t - new Date(f.capturedAt).getTime() > 30 * DAY
    })
    .map((f) => f.id)
}
