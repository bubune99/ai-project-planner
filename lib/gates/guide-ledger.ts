/**
 * The ledger: a statement's numbers, worked out from what is recorded. Pure: no database, no React, no clock.
 *
 * Two things are counted here, and they come from different places.
 *
 * 1. Since when a statement has been in force in its current wording, and since when it has been on trial. These
 *    come from the versions kept on every save (gate_guide_versions, migration 085).
 * 2. How many times its checks were owed, and how each ended. A statement's checks reach a project as rules
 *    (toRules), and the plugin records each one per file. TODAY THOSE RECORDS STAY IN THE PROJECT'S FOLDER
 *    (.gates/code.json) AND ARE NOT SENT TO THE PLANNER, so the store has none to give and every statement reads
 *    "No checks recorded yet". The counting below is ready for them: a CheckRecord is one time one check was owed on
 *    one file, named by the rule id the plugin already holds.
 *
 * Nothing recorded is never shown as a number: zero passed of zero owed would read like a clean record.
 */
import { ruleId, type GuideContent, type GuideVersion } from "./guides"

/** One time one check of a statement was owed on one file, and how it ended ("open": still owed). */
export interface CheckRecord {
  /** The rule id the plugin was given for the check: ruleId(statement name, check id). */
  rule: string
  file: string
  /** When it was owed (ISO). */
  at: string
  result: "passed" | "failed" | "waived" | "open"
}

export interface CheckCounts {
  owed: number
  passed: number
  failed: number
  waived: number
  /** Owed and not yet settled. */
  open: number
  lastFailed: { at: string; file: string } | null
}

export interface Ledger {
  /** A rule (true) or set aside as a draft (false). */
  inForce: boolean
  /**
   * Since when it has read as it does now and been in that state. atLeast: history was not being kept then, so
   * this is the earliest moment known, not the moment it began. Null: nothing says.
   */
  since: { at: string; atLeast: boolean } | null
  /** Null: nothing recorded. Never a row of zeros. */
  checks: CheckCounts | null
  /** Null: permanent. since null: on trial, but when the trial began was not kept, so nothing is counted for it. */
  trial: { since: string | null; checks: CheckCounts | null } | null
}

// The name is left out: it is the key, it never changes, and a save may spell its capitals differently.
const wording = (c: GuideContent) => JSON.stringify([
  c.summary.trim(), c.applies.files ?? [], c.applies.imports ?? [], c.checks.map((k) => [k.id, k.say, k.auto ?? null]), c.status,
])

/**
 * The first version of the newest unbroken run for which `same` holds, or null when the newest version does not.
 * A removal breaks the run: while it was removed it was not in force, so the run starts where it was put back.
 */
function runStart(versions: GuideVersion[], same: (c: GuideContent) => boolean): GuideVersion | null {
  const desc = [...versions].sort((a, b) => b.version - a.version)
  let start: GuideVersion | null = null
  for (const v of desc) { if (v.change === "removed" || !same(v.content)) break; start = v }
  return start
}

/** The counts for a set of records, or null when there are none. */
export function countChecks(records: CheckRecord[]): CheckCounts | null {
  if (!records.length) return null
  const of = (r: CheckRecord["result"]) => records.filter((x) => x.result === r).length
  const last = records.filter((x) => x.result === "failed").reduce<CheckRecord | null>((a, b) => (!a || Date.parse(b.at) > Date.parse(a.at) ? b : a), null)
  return { owed: records.length, passed: of("passed"), failed: of("failed"), waived: of("waived"), open: of("open"), lastFailed: last ? { at: last.at, file: last.file } : null }
}

/**
 * One guide's ledger. `guide` is the row as it stands (updatedAt: its last write, used only when no version was
 * kept); `versions` are its kept versions in any order; `records` may hold any statement's records, only this
 * one's are counted.
 */
export function ledgerOf(guide: GuideContent & { updatedAt?: string | null }, versions: GuideVersion[], records: CheckRecord[]): Ledger {
  const now = wording(guide)
  const start = runStart(versions, (c) => wording(c) === now)
  const since = start ? { at: start.at, atLeast: start.change === "before" } : guide.updatedAt ? { at: guide.updatedAt, atLeast: true } : null
  const rules = new Set(guide.checks.map((c) => ruleId(guide.name, c.id)))
  const mine = records.filter((r) => rules.has(r.rule))
  let trial: Ledger["trial"] = null
  if (guide.trialUntil) {
    const began = runStart(versions, (c) => !!c.trialUntil)?.at ?? null
    trial = { since: began, checks: began ? countChecks(mine.filter((r) => Date.parse(r.at) >= Date.parse(began))) : null }
  }
  return { inForce: guide.status === "active", since, checks: countChecks(mine), trial }
}

const times = (n: number) => `${n} time${n === 1 ? "" : "s"}`

function countWords(c: CheckCounts | null, day: (iso: string) => string): string {
  if (!c) return "No checks recorded yet."
  const parts = [`${c.passed} passed`, `${c.failed} failed`, ...(c.waived ? [`${c.waived} waived`] : []), ...(c.open ? [`${c.open} still owed`] : [])]
  return `Checked ${times(c.owed)}: ${parts.join(", ")}.${c.lastFailed ? ` Last failed ${day(c.lastFailed.at)} on ${c.lastFailed.file}.` : ""}`
}

/** The ledger in words. `day` writes a moment as a date for the person reading (their own timezone). */
export function ledgerWords(l: Ledger, day: (iso: string) => string): { wording: string; checks: string; trial: string | null } {
  const since = l.since ? `${l.since.atLeast ? "at least " : ""}${day(l.since.at)}` : "–"
  const counted = (c: CheckCounts | null) => { const w = countWords(c, day); return w[0].toLowerCase() + w.slice(1) }
  return {
    wording: l.inForce ? `In force in this wording since ${since}.` : `A draft since ${since}: not in force.`,
    checks: countWords(l.checks, day),
    trial: !l.trial ? null : l.trial.since ? `Since the trial began ${day(l.trial.since)}: ${counted(l.trial.checks)}` : "Since the trial began: –",
  }
}
