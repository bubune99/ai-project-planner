/**
 * The assistant's hands (control layer spec, 2026-10-17): one place for
 *
 * - RISK CLASSES — read / edit-draft / commit / destructive / money — for every
 *   UI capability (from its effect) and every tool (from its registry entry),
 *   and what the assistant may do with each: act, point only, or ask approval.
 * - THE STEP CONTRACT — act, read the result back, retry once, then stop with
 *   one plain sentence and the way to do it by hand. Never silent, never a
 *   failure narrated as success.
 * - REVEAL PATHS AS DATA — a unit says, in order, what opens it; code runs and
 *   verifies each step. The model never guesses a click path.
 * - RESOLVING A UNIT by key, selector, label or the type's aliases — never
 *   swapped for a different thing when it can't be found.
 *
 * Pure and app-agnostic (no DOM; the browser runner supplies the I/O).
 * Asserted by control.assert.ts.
 */

import type { UiEffect } from './capabilities'

// ── Risk classes ─────────────────────────────────────────────────────

export type RiskClass = 'read' | 'edit-draft' | 'commit' | 'destructive' | 'money'

/** What the assistant may do with an action of each class. */
export type AgentMay = 'act' | 'point' | 'approve'

export const AGENT_MAY: Readonly<Record<RiskClass, AgentMay>> = {
  read: 'act',
  'edit-draft': 'act',
  // The person presses commit and destructive controls; the assistant points at them.
  commit: 'point',
  destructive: 'point',
  // Price, stock, order status: always an explicit approval with before and after.
  money: 'approve',
}

const EFFECT_RISK: Readonly<Record<UiEffect, RiskClass>> = {
  view: 'read',
  layout: 'read',
  state: 'edit-draft',
  draft: 'edit-draft',
  approve: 'commit',
  commit: 'commit',
  destructive: 'destructive',
}

/** A UI capability's class, from its effect (every effect maps; the type makes a new one fail to compile). */
export function riskOfEffect(effect: UiEffect): RiskClass {
  return EFFECT_RISK[effect]
}

/** What a tool's registry entry says about it (lib/ai/governance/tool-registry). */
export interface ToolRiskInput {
  effect: 'read' | 'draft' | 'write' | 'irreversible'
  highRisk?: boolean
  /** Set by the app (money tools): true, or true for some inputs (a price or stock change). */
  money?: true | ((input: unknown) => boolean)
}

/** A tool's class for one call: money when its money rule says so; irreversible = destructive; a live write = commit. */
export function riskOfTool(meta: ToolRiskInput, input?: unknown): RiskClass {
  if (meta.money === true || (typeof meta.money === 'function' && meta.money(input))) return 'money'
  if (meta.effect === 'irreversible') return 'destructive'
  if (meta.effect === 'write') return 'commit'
  if (meta.effect === 'draft') return 'edit-draft'
  return 'read'
}

export const agentMay = (risk: RiskClass): AgentMay => AGENT_MAY[risk]

/** Tools added outside the governed registry, classed here explicitly (the chat adds load_tools after the guard: it only turns tool groups on). */
export const UNGOVERNED_TOOL_RISK: Readonly<Record<string, RiskClass>> = { load_tools: 'read' }

// ── Units and their reveal paths ─────────────────────────────────────

/** What must be true after a step (read back from the page). */
export type Readback =
  | { kind: 'visible'; selector: string }
  | { kind: 'text'; selector: string; equals: string }
  | { kind: 'route'; path: string }

/** One step of a reveal path: a screen capability, what it should make true, and how a person does it. */
export interface RevealStep {
  capability: string
  args: Record<string, unknown>
  /** Plain words for the sentence on failure: "open the Details drawer". */
  what: string
  expect: Readback
  /** How the person can do it themselves: "Use the Details button at the top right." */
  manual: string
}

export interface ControlUnit {
  key: string
  label: string
  selector: string
  /** Other words people use for it (from the type). */
  aliases?: ReadonlyArray<string>
  /** What opens it, in order (empty: it is on the page). */
  revealPath?: ReadonlyArray<RevealStep>
}

const STOP = new Set(['the', 'a', 'an', 'of', 'on', 'to', 'it', 'its', 'my', 'this', 'and', 'or', 'for', 'in', 'is'])
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
const phraseIn = (q: Set<string>, phrase: string) => {
  const w = words(phrase).map(stem)
  return w.length > 0 && w.every((x) => q.has(x)) ? w.join(' ').length : 0
}

/**
 * The unit a request means: its key or selector exactly, else the unit whose
 * label OR one of its aliases has every word in the text (plurals forgiven);
 * the longest match wins. Nothing matches → null (never a guess).
 */
export function resolveUnit<U extends ControlUnit>(text: string, units: ReadonlyArray<U> | null | undefined): U | null {
  if (!units?.length || !text.trim()) return null
  const t = text.trim()
  const exact = units.find((u) => u.key === t || u.selector === t)
  if (exact) return exact
  const q = new Set(words(t).map(stem))
  let best: U | null = null
  let bestLen = 0
  for (const u of units) {
    const len = Math.max(phraseIn(q, u.label), ...(u.aliases ?? []).map((a) => phraseIn(q, a)))
    if (len > bestLen) {
      best = u
      bestLen = len
    }
  }
  return best
}

/** The plan to show a unit: its reveal steps, then a final check that the unit itself is on screen. */
export function planShow(unit: ControlUnit): { steps: ReadonlyArray<RevealStep>; final: Readback } {
  return { steps: unit.revealPath ?? [], final: { kind: 'visible', selector: unit.selector } }
}

// ── The step contract ────────────────────────────────────────────────

export interface ControlIO {
  /** Run a screen capability (view / draft class only — the runner refuses others). */
  act: (step: RevealStep) => Promise<{ ok: boolean; message?: string }>
  /** Is this true on the page now? */
  read: (r: Readback) => boolean | Promise<boolean>
  /** Let the page settle (animations, a section mounting). */
  settle: (ms: number) => Promise<void>
}

export const CONTROL_LIMITS = {
  /** One retry, then stop. */
  retries: 1,
  /** How long a step may take to show its result, in ms (checked a few times). */
  waitMs: 1500,
  checks: 5,
} as const

export type ControlResult =
  | { ok: true; steps: number }
  | { ok: false; steps: number; failedAt: number; sentence: string; manual: string }

async function holds(io: ControlIO, r: Readback): Promise<boolean> {
  for (let i = 0; i < CONTROL_LIMITS.checks; i++) {
    if (await io.read(r)) return true
    await io.settle(CONTROL_LIMITS.waitMs / CONTROL_LIMITS.checks)
  }
  return false
}

/** "I couldn't open the Details drawer. Use the Details button at the top right." */
export function failureSentence(what: string, manual: string): string {
  return `I couldn’t ${what}. ${manual}`.trim()
}

/**
 * Run a reveal path: each step is skipped when its result already holds,
 * else acted, read back, retried once, and on a second miss the run stops
 * with one plain sentence and the manual path. Then the final check.
 */
export async function runPlan(plan: { steps: ReadonlyArray<RevealStep>; final: Readback }, io: ControlIO, unitLabel: string): Promise<ControlResult> {
  let done = 0
  for (const [i, step] of plan.steps.entries()) {
    if (await io.read(step.expect)) continue
    let ok = false
    for (let attempt = 0; attempt <= CONTROL_LIMITS.retries && !ok; attempt++) {
      const r = await io.act(step)
      ok = r.ok && (await holds(io, step.expect))
    }
    if (!ok) return { ok: false, steps: done, failedAt: i, sentence: failureSentence(step.what, step.manual), manual: step.manual }
    done++
  }
  if (!(await holds(io, plan.final))) {
    const last = plan.steps[plan.steps.length - 1]
    const manual = last?.manual ?? ''
    return { ok: false, steps: done, failedAt: plan.steps.length, sentence: failureSentence(`find “${unitLabel}” on this screen`, manual), manual }
  }
  return { ok: true, steps: done }
}

/** Read back a set of facts (lane B's fill: the field shows the typed value), retrying a few times. */
export async function verify(readbacks: ReadonlyArray<Readback>, io: Pick<ControlIO, 'read' | 'settle'>): Promise<{ ok: true } | { ok: false; failed: Readback }> {
  for (const r of readbacks) if (!(await holds(io as ControlIO, r))) return { ok: false, failed: r }
  return { ok: true }
}

/** What show_unit returns to the model in the same turn. */
export type ShowUnitOutput =
  | { ok: true; shown: string; selector: string; sentence?: string }
  | { ok: false; error: string; closest?: string }

/** The not-found answer: plain words, and the closest real part when there is one (never pointed at). */
export function notFound(asked: string, closest: ControlUnit | null): ShowUnitOutput {
  const what = asked.trim().slice(0, 60) || 'that'
  return { ok: false, error: `I can’t find “${what}” on this screen.`, ...(closest ? { closest: closest.label } : {}) }
}

// ── Money rules on the tool registry ─────────────────────────────────

/** A tool entry that can carry a money rule and an input-dependent approval gate. */
export interface MoneyAwareMeta {
  highRisk?: boolean
  highRiskWhen?: (input: unknown) => boolean
  money?: true | ((input: unknown) => boolean)
}

/**
 * The app's money tools on its registry: `money` set, and approval required
 * whenever the rule matches (always for `true`) — the governance gate the
 * registry already has (highRisk / highRiskWhen), so nothing new to enforce.
 */
export function withMoneyRules<M extends MoneyAwareMeta>(registry: Readonly<Record<string, M>>, rules: Readonly<Record<string, true | ((input: unknown) => boolean)>>): { registry: Record<string, M>; unknown: string[] } {
  const out: Record<string, M> = {}
  for (const [k, m] of Object.entries(registry)) {
    const rule = Object.hasOwn(rules, k) ? rules[k] : undefined
    if (!rule) {
      out[k] = m
      continue
    }
    if (rule === true) out[k] = { ...m, money: true, highRisk: true }
    else {
      const before = m.highRiskWhen
      out[k] = { ...m, money: rule, highRiskWhen: (input: unknown) => (before ? before(input) : false) || rule(input) }
    }
  }
  return { registry: out, unknown: Object.keys(rules).filter((k) => !Object.hasOwn(registry, k)) }
}
