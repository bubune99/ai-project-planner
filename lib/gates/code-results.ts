/**
 * Code-check results: what the plugin found when it ran a rule on a file, kept in the planner (migration 088).
 * Pure: no database, no React, no clock (`now` is passed in). SQL is in code-result-store.ts.
 *
 * A statement's checks reach a project as rules (toRules in guides.ts); the plugin runs each rule on each file an
 * agent writes. Until now the result stayed in the project's folder (.gates/code.json). It is now sent here, so a
 * statement can show how often its checks passed and failed (guide-ledger.ts).
 *
 * WHAT IS KEPT
 *   gate_code_results         where one rule stands on one file in one project, now: one row, replaced by a newer result.
 *   gate_code_result_events   each CHANGE of that result (the first result included), never updated. A file edited
 *                             thirty times that passes thirty times is one event, not thirty: what is counted is how
 *                             often a check came to pass or came to fail on a file, not how often a file was saved.
 *
 * HOW A RULE ID MAPS BACK TO ITS STATEMENT
 *   A rule id is ruleId(statement name, check id): the name in lowercase with dashes, a dash, the check's id. The
 *   statement is the guide one of whose checks compiles to that id (guideForRule). It is looked up when a result
 *   arrives and kept on the row as guide_id, so a result stays with its statement even if a check's id is later
 *   changed. A statement's name is its key and is never changed by a save; saved under a new name it is a new
 *   statement with new rule ids, and the old results stay with the old one.
 */
import { ruleId } from "./guides"
import type { CheckRecord } from "./guide-ledger"

export type CodeStatus = "owed" | "passed" | "failed" | "waived"
const STATUSES: CodeStatus[] = ["owed", "passed", "failed", "waived"]
/** Where a result came from: the check run when a file was written, `gates verify`, `gates code send`, or the owner. */
const SOURCES = ["edit", "verify", "send", "owner"]

export const MAX_BATCH = 500
export const MAX_FILE = 400
const MAX_RULE = 200
const MAX_NOTE = 1000
/** A sender's clock may run a little ahead; further ahead than this is taken as now. */
const AHEAD_MS = 5 * 60_000

export interface CodeResult {
  rule: string
  /** Relative to the project's folder, forward slashes. */
  file: string
  status: CodeStatus
  note: string | null
  /** When the check was run (ISO). */
  at: string
}

export type Parsed =
  | { ok: true; results: CodeResult[]; actor: "owner" | "agent"; who: string; source: string }
  | { ok: false; status: 400 | 403; error: string }

/** A path inside the project, or null: not absolute, not climbing out, no control characters, capped. */
function cleanFile(v: unknown): string | null {
  if (typeof v !== "string") return null
  const f = v.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "")
  // eslint-disable-next-line no-control-regex
  if (!f || f.length > MAX_FILE || /[\u0000-\u001f\u007f]/.test(f) || f.startsWith("/") || /^[A-Za-z]:/.test(f) || f.split("/").includes("..")) return null
  return f
}

/**
 * Reads what was sent to POST /api/projects/[id]/gates/code-results:
 *   { results: [{ rule, file, status: owed | passed | failed | waived, note?, at? }], source?, agent?, agentName? }
 * `asOwner`: the request came from a signed-in browser session (an API key never is). Everything is refused together
 * when any result is wrong, so a batch is either kept whole or not at all.
 */
export function parseResults(raw: unknown, o: { now: string; asOwner: boolean }): Parsed {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const list = b && Array.isArray(b.results) ? (b.results as unknown[]) : null
  if (!list || !list.length) return { ok: false, status: 400, error: "Send { results: [{ rule, file, status, note?, at? }] } with at least one result" }
  if (list.length > MAX_BATCH) return { ok: false, status: 400, error: `Send at most ${MAX_BATCH} results at once (this was ${list.length}); send the rest in another request` }
  const actor = o.asOwner && b!.agent !== true ? "owner" : "agent"
  const nowMs = Date.parse(o.now)
  const errors: string[] = []
  const byKey = new Map<string, CodeResult>()
  let waives = false
  list.forEach((item, i) => {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const say = (m: string) => errors.push(`result ${i + 1}: ${m}`)
    const rule = typeof r.rule === "string" && r.rule.length <= MAX_RULE && /^\S+$/.test(r.rule) ? r.rule : null
    if (!rule) say(`rule is the rule's id: no spaces, at most ${MAX_RULE} characters`)
    const file = cleanFile(r.file)
    if (!file) say(`file is a path inside the project (not absolute, no "..", at most ${MAX_FILE} characters)`)
    const status = r.status === "open" ? "owed" : STATUSES.find((s) => s === r.status)
    if (!status) say("status is owed, passed, failed or waived")
    const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, MAX_NOTE) : null
    if (status === "waived") { waives = true; if (!note) say("a waived check needs a note saying why") }
    let at = o.now
    if (r.at !== undefined && r.at !== null) {
      const t = typeof r.at === "string" ? Date.parse(r.at) : NaN
      if (Number.isNaN(t)) say("at is a time such as 2026-11-22T15:00:00Z")
      else at = t > nowMs + AHEAD_MS ? o.now : new Date(t).toISOString()
    }
    if (!rule || !file || !status) return
    const key = `${rule}\n${file}`
    const had = byKey.get(key)
    if (!had || Date.parse(at) >= Date.parse(had.at)) byKey.set(key, { rule, file, status, note, at })
  })
  // A waiver is the owner's own, as it is for a page check: never an API key, never an agent using their tab.
  if (waives && actor !== "owner") return { ok: false, status: 403, error: "Only the owner, signed in at the planner, can waive a check" }
  if (errors.length) return { ok: false, status: 400, error: `${errors.slice(0, 5).join("; ")}${errors.length > 5 ? `; and ${errors.length - 5} more` : ""}` }
  const source = b!.source === undefined ? "edit" : SOURCES.includes(b!.source as string) ? (b!.source as string) : "other"
  return { ok: true, results: [...byKey.values()], actor, who: actor === "agent" && typeof b!.agentName === "string" ? b!.agentName.trim().slice(0, 80) : "", source }
}

/** As much of a guide as is needed to tell which rule ids are its own. projectId null: it is for all projects. */
export interface GuideKey { id: string; name: string; projectId: string | null; checks: { id: string }[] }

/**
 * The id of the guide a rule id belongs to, among the guides that apply to a project: the project's own first, then
 * those for all projects. Null when it is no guide's (the plugin's built-in rules, a statement no longer on the
 * list, a check whose id was changed), and null when two guides at the same level compile to the same id: not guessed.
 */
export function guideForRule(rule: string, guides: GuideKey[], projectId: string | null): string | null {
  const has = (g: GuideKey) => g.checks.some((c) => ruleId(g.name, c.id) === rule)
  const own = projectId ? guides.filter((g) => g.projectId === projectId && has(g)) : []
  const found = own.length ? own : guides.filter((g) => g.projectId === null && has(g))
  return found.length === 1 ? found[0].id : null
}

/** True when a query failed because migration 088 has not been applied where it ran. */
export function tableMissing(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : ""
  return /relation "gate_code_result(s|_events)" does not exist/.test(message)
}

export const NOT_KEPT_YET = "Check results are not kept here yet: the table for them has not been added to this database (migration 088)."

/** Results counted in the database: n of them for one rule (and guide) in one status, the newest at last_at on last_file. */
export interface TallyRow { rule_id: string; guide_id: string | null; status: string; n: number; last_at: string | Date; last_file: string }

const iso = (d: string | Date) => new Date(d).toISOString()

/** Counted rows as the ledger's records. "open" is a check owed now; a bare "owed" (an event, not a standing) is not counted. */
export function toRecords(rows: TallyRow[]): CheckRecord[] {
  const out: CheckRecord[] = []
  for (const r of rows) {
    const result = (["passed", "failed", "waived", "open"] as const).find((s) => s === r.status)
    if (result) out.push({ rule: r.rule_id, guide: r.guide_id, file: r.last_file, at: iso(r.last_at), result, n: Number(r.n) })
  }
  return out
}

export interface RuleSummary {
  rule: string
  guideId: string | null
  /** The statement's or stack entry's name, when it is on the list. */
  guide: string | null
  /** How many files this rule has a result on. */
  files: number
  owed: number; passed: number; failed: number; waived: number
  /** Among the files failing now, the newest. */
  lastFailed: { at: string; file: string } | null
  lastAt: string
}

/** Where a project's files stand now, by rule: failing rules first. `rows` count gate_code_results by rule, guide and status. */
export function summarize(rows: TallyRow[], guides: { id: string; name: string }[]): RuleSummary[] {
  const names = new Map(guides.map((g) => [g.id, g.name]))
  const by = new Map<string, RuleSummary>()
  for (const r of rows) {
    const status = STATUSES.find((s) => s === r.status)
    if (!status) continue
    const key = `${r.rule_id}\n${r.guide_id ?? ""}`
    const at = iso(r.last_at), n = Number(r.n)
    const s = by.get(key) ?? { rule: r.rule_id, guideId: r.guide_id, guide: (r.guide_id && names.get(r.guide_id)) || null, files: 0, owed: 0, passed: 0, failed: 0, waived: 0, lastFailed: null, lastAt: at }
    by.set(key, { ...s, files: s.files + n, [status]: s[status] + n, lastFailed: status === "failed" ? { at, file: r.last_file } : s.lastFailed, lastAt: at > s.lastAt ? at : s.lastAt })
  }
  return [...by.values()].sort((a, b) => b.failed - a.failed || b.owed - a.owed || a.rule.localeCompare(b.rule))
}
