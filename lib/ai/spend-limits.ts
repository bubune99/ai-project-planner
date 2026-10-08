/**
 * AI spend limits — pure rules, no database, no SDK calls. Env and time are
 * passed in.
 *
 *   per-user tokens / window  AI_USER_TOKEN_LIMIT     default 1,000,000
 *                             (alias AI_USER_DAILY_TOKEN_LIMIT)
 *   per-user window           AI_BUDGET_WINDOW_HOURS  default 5 (a session
 *                             window; 24 = daily)
 *   site-wide tokens / window AI_GLOBAL_TOKEN_LIMIT   default 5,000,000, 0 = off
 *                             (alias AI_GLOBAL_DAILY_TOKEN_LIMIT)
 *   site-wide window          AI_GLOBAL_WINDOW_HOURS  default 24
 *   per-request tokens        AI_REQUEST_TOKEN_LIMIT  default 300,000
 *   kill switch               AI_DISABLED=1
 *
 * Windows are fixed and epoch-aligned (start = floor(now / window) * window),
 * so counter rows carry window_start and roll over on their own; a reset
 * deletes the active row. Tokens are input + output as the provider reports
 * them, summed over every model step of the main agent and every delegate.
 *
 * Asserted in lib/ai/spend-limits.assert.ts.
 */

export const DEFAULT_USER_WINDOW_TOKENS = 1_000_000
export const DEFAULT_GLOBAL_WINDOW_TOKENS = 5_000_000
export const DEFAULT_USER_WINDOW_HOURS = 5
export const DEFAULT_GLOBAL_WINDOW_HOURS = 24
export const DEFAULT_REQUEST_TOKENS = 300_000

/** max output tokens for one model step (main agent and delegates). */
export const MAX_OUTPUT_TOKENS = 4096
/** Delegate (sub-agent) calls allowed in one chat request. */
export const MAX_DELEGATE_CALLS = 3
/** Characters allowed in the latest user message. */
export const MAX_USER_MESSAGE_CHARS = 20_000
/** History sent to the model: at most this many messages ... */
export const MAX_HISTORY_MESSAGES = 30
/** ... and at most this many characters in total (oldest dropped first). */
export const MAX_HISTORY_CHARS = 120_000

const HOUR = 60 * 60 * 1000
/** Longest window accepted from env (31 days). */
const MAX_WINDOW_HOURS = 24 * 31

export interface SpendLimits {
  disabled: boolean
  /** Tokens per user per user window. 0 = AI off for users. */
  userTokens: number
  userWindowHours: number
  /** Tokens site-wide per global window. 0 = no ceiling. */
  globalTokens: number
  globalWindowHours: number
  perRequest: number
}

type Env = Record<string, string | undefined>

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw.replace(/_/g, ""))
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

function windowHours(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 && n <= MAX_WINDOW_HOURS ? n : fallback
}

export function readSpendLimits(env: Env): SpendLimits {
  const flag = (env.AI_DISABLED ?? "").trim().toLowerCase()
  return {
    disabled: flag === "1" || flag === "true" || flag === "yes",
    userTokens: nonNegativeInt(env.AI_USER_TOKEN_LIMIT ?? env.AI_USER_DAILY_TOKEN_LIMIT, DEFAULT_USER_WINDOW_TOKENS),
    userWindowHours: windowHours(env.AI_BUDGET_WINDOW_HOURS, DEFAULT_USER_WINDOW_HOURS),
    globalTokens: nonNegativeInt(env.AI_GLOBAL_TOKEN_LIMIT ?? env.AI_GLOBAL_DAILY_TOKEN_LIMIT, DEFAULT_GLOBAL_WINDOW_TOKENS),
    globalWindowHours: windowHours(env.AI_GLOBAL_WINDOW_HOURS, DEFAULT_GLOBAL_WINDOW_HOURS),
    perRequest: nonNegativeInt(env.AI_REQUEST_TOKEN_LIMIT, DEFAULT_REQUEST_TOKENS) || DEFAULT_REQUEST_TOKENS,
  }
}

export interface UsageWindow {
  /** Window start, epoch ms (inclusive). */
  start: number
  /** Window end = when it resets, epoch ms (exclusive). */
  end: number
}

/** The fixed window containing `nowMs`. Pure. */
export function windowFor(nowMs: number, hours: number): UsageWindow {
  const len = Math.round(hours * HOUR)
  const start = Math.floor(nowMs / len) * len
  return { start, end: start + len }
}

/** "in 2h 5m (14:00 UTC)" — when a window resets, for people. Pure. */
export function resetText(resetAtMs: number, nowMs: number): string {
  const mins = Math.max(1, Math.ceil((resetAtMs - nowMs) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const rel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
  const iso = new Date(resetAtMs).toISOString()
  const day = iso.slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10) ? "" : `${iso.slice(0, 10)} `
  return `in ${rel} (${day}${iso.slice(11, 16)} UTC)`
}

export interface WindowUsage {
  user: number
  global: number
}

export type AdmissionResult =
  | { ok: true }
  | {
      ok: false
      status: 429 | 503
      code: "AI_DISABLED" | "USER_LIMIT" | "GLOBAL_LIMIT" | "USAGE_UNAVAILABLE"
      message: string
      /** ISO time the blocking window resets (absent for kill switch / outage). */
      resetAt?: string
    }

/**
 * Admission decision. `usage` is null when it could not be read: that refuses
 * (fail closed). A user limit of 0 refuses everyone (AI off for users).
 */
export function decideAdmission(limits: SpendLimits, usage: WindowUsage | null, nowMs: number): AdmissionResult {
  if (limits.disabled) {
    return { ok: false, status: 503, code: "AI_DISABLED", message: "The assistant is switched off right now." }
  }
  if (!usage) {
    return { ok: false, status: 503, code: "USAGE_UNAVAILABLE", message: "The assistant is unavailable right now. Try again shortly." }
  }
  if (usage.user >= limits.userTokens) {
    const end = windowFor(nowMs, limits.userWindowHours).end
    return {
      ok: false, status: 429, code: "USER_LIMIT", resetAt: new Date(end).toISOString(),
      message: `You've reached your assistant usage limit for this ${limits.userWindowHours}-hour window. It resets ${resetText(end, nowMs)}.`,
    }
  }
  if (limits.globalTokens > 0 && usage.global >= limits.globalTokens) {
    const end = windowFor(nowMs, limits.globalWindowHours).end
    return {
      ok: false, status: 503, code: "GLOBAL_LIMIT", resetAt: new Date(end).toISOString(),
      message: `The assistant has reached its site-wide usage limit. It resets ${resetText(end, nowMs)}.`,
    }
  }
  return { ok: true }
}

/** Tokens one step (or one call) consumed. */
export function usageTokens(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined): number {
  if (!usage) return 0
  const total = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  return Number.isFinite(total) && total > 0 ? total : 0
}

/**
 * Per-request budget shared by the main agent and its delegates. Counts
 * tokens and delegate calls; `failed` is set when usage could not be recorded,
 * which stops the run (fail closed).
 */
export class RunBudget {
  tokens = 0
  delegateCalls = 0
  failed = false
  constructor(readonly maxTokens: number, readonly maxDelegateCalls: number = MAX_DELEGATE_CALLS) {}

  add(tokens: number): void {
    this.tokens += tokens
  }

  /** True once the run must stop taking new model steps. */
  exhausted(): boolean {
    return this.failed || this.tokens >= this.maxTokens
  }

  /** Reserve one delegate call; false when the cap or the budget is reached. */
  tryDelegate(): boolean {
    if (this.exhausted() || this.delegateCalls >= this.maxDelegateCalls) return false
    this.delegateCalls += 1
    return true
  }
}

export interface HistoryMessage {
  role: "user" | "assistant" | "system"
  content: string
}

/**
 * Most recent history that fits the message and character caps, in order.
 * Oldest messages go first; a single oversized message is skipped rather than
 * truncated mid-thought.
 */
export function trimHistory<T extends HistoryMessage>(
  history: readonly T[],
  maxMessages: number = MAX_HISTORY_MESSAGES,
  maxChars: number = MAX_HISTORY_CHARS,
): T[] {
  const kept: T[] = []
  let chars = 0
  for (let i = history.length - 1; i >= 0 && kept.length < maxMessages; i--) {
    const m = history[i]
    const len = (m.content ?? "").length
    if (chars + len > maxChars) {
      if (kept.length === 0) continue
      break
    }
    kept.push(m)
    chars += len
  }
  return kept.reverse()
}
