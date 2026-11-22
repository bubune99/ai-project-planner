/**
 * Code-check results: saving what the plugin sends and reading it back (migration 088). Rules are in
 * code-results.ts; this file is SQL only. Where the tables are not there yet, a write throws ResultsNotKept (the
 * route answers 503 with its sentence) and a read answers `kept: false`, so nothing breaks before the migration.
 */
import { sql } from "@/lib/db/client"
import type { CheckRecord } from "./guide-ledger"
import { guideForRule, NOT_KEPT_YET, summarize, tableMissing, toRecords, type CodeResult, type GuideKey, type RuleSummary, type TallyRow } from "./code-results"

export class ResultsNotKept extends Error {
  constructor() { super(NOT_KEPT_YET) }
}

/**
 * Saves a batch for one project. A result older than (or as old as) the one already kept for that rule and file is
 * left out, so sending the same thing twice changes nothing. A result that differs from the one kept (or is the
 * first) is also written to the history. `userId` is whose rules these are, and `guides` are the guides that apply
 * to the project for them (listGuides): each result is tied to the guide its rule came from.
 */
export async function saveCodeResults(a: { projectId: string; userId: string; guides: GuideKey[]; results: CodeResult[]; actor: "owner" | "agent"; who: string; source: string }) {
  try {
    const rows = a.results.map((r) => ({ rule_id: r.rule, guide_id: guideForRule(r.rule, a.guides, a.projectId), file: r.file, status: r.status, note: r.note, checked_at: r.at }))
    const [out] = (await sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(rule_id text, guide_id uuid, file text, status text, note text, checked_at timestamptz)
      ), kept AS (
        SELECT r.rule_id, r.file, r.status, r.checked_at FROM gate_code_results r
        JOIN incoming i ON i.rule_id = r.rule_id AND i.file = r.file WHERE r.project_id = ${a.projectId}::uuid
      ), fresh AS (
        SELECT i.*, (k.rule_id IS NULL OR k.status <> i.status) AS changed FROM incoming i
        LEFT JOIN kept k ON k.rule_id = i.rule_id AND k.file = i.file
        WHERE k.rule_id IS NULL OR i.checked_at > k.checked_at
      ), saved AS (
        INSERT INTO gate_code_results (project_id, user_id, rule_id, guide_id, file, status, note, actor, who, source, checked_at)
        SELECT ${a.projectId}::uuid, ${a.userId}::uuid, rule_id, guide_id, file, status, note, ${a.actor}::text, ${a.who}::text, ${a.source}::text, checked_at FROM fresh
        ON CONFLICT (project_id, rule_id, file) DO UPDATE SET
          user_id = EXCLUDED.user_id, guide_id = COALESCE(EXCLUDED.guide_id, gate_code_results.guide_id), status = EXCLUDED.status, note = EXCLUDED.note,
          actor = EXCLUDED.actor, who = EXCLUDED.who, source = EXCLUDED.source, checked_at = EXCLUDED.checked_at, updated_at = now()
          WHERE EXCLUDED.checked_at > gate_code_results.checked_at
        RETURNING 1
      ), history AS (
        INSERT INTO gate_code_result_events (project_id, user_id, rule_id, guide_id, file, status, note, actor, who, source, checked_at)
        SELECT ${a.projectId}::uuid, ${a.userId}::uuid, rule_id, guide_id, file, status, note, ${a.actor}::text, ${a.who}::text, ${a.source}::text, checked_at FROM fresh WHERE changed
        ON CONFLICT (project_id, rule_id, file, status, checked_at) DO NOTHING
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM saved)::int AS saved, (SELECT count(*) FROM history)::int AS changes
    `) as { saved: number; changes: number }[]
    return { received: a.results.length, saved: out.saved, changes: out.changes, tiedToAGuide: rows.filter((r) => r.guide_id).length }
  } catch (error) {
    if (tableMissing(error)) throw new ResultsNotKept()
    throw error
  }
}

/** Where a project's files stand now, by rule. `guides` give the rules their statements' names. */
export async function projectCodeResults(projectId: string, guides: { id: string; name: string }[]): Promise<{ kept: boolean; files: number; rules: RuleSummary[] }> {
  try {
    const rows = (await sql`
      SELECT rule_id, guide_id, status, count(*)::int AS n, max(checked_at) AS last_at, (array_agg(file ORDER BY checked_at DESC))[1] AS last_file
      FROM gate_code_results WHERE project_id = ${projectId}::uuid GROUP BY rule_id, guide_id, status
    `) as TallyRow[]
    const [{ files }] = (await sql`SELECT count(DISTINCT file)::int AS files FROM gate_code_results WHERE project_id = ${projectId}::uuid`) as { files: number }[]
    return { kept: true, files, rules: summarize(rows, guides) }
  } catch (error) {
    if (tableMissing(error)) return { kept: false, files: 0, rules: [] }
    throw error
  }
}

/**
 * A person's results as the ledger's records, across all their projects: every settled change counted by rule,
 * guide and result, plus the checks owed now. `since`: the earliest moment a trial in force began, when there is
 * one; `sinceTrial` then holds the same from that moment on, one result each, for the trials' own numbers.
 * `kept` is false when the tables are not there yet or hold nothing of theirs.
 */
export async function ledgerRecords(userId: string, since: string | null): Promise<{ kept: boolean; records: CheckRecord[]; sinceTrial: CheckRecord[] }> {
  try {
    const counted = (await sql`
      SELECT rule_id, guide_id, status, count(*)::int AS n, max(checked_at) AS last_at, (array_agg(file ORDER BY checked_at DESC))[1] AS last_file
      FROM gate_code_result_events WHERE user_id = ${userId}::uuid AND status <> 'owed' GROUP BY rule_id, guide_id, status
      UNION ALL
      SELECT rule_id, guide_id, 'open', count(*)::int, max(checked_at), (array_agg(file ORDER BY checked_at DESC))[1]
      FROM gate_code_results WHERE user_id = ${userId}::uuid AND status = 'owed' GROUP BY rule_id, guide_id
    `) as TallyRow[]
    const each = !since || !counted.length ? [] : (await sql`
      SELECT rule_id, guide_id, status, 1 AS n, checked_at AS last_at, file AS last_file
      FROM gate_code_result_events WHERE user_id = ${userId}::uuid AND status <> 'owed' AND checked_at >= ${since}::timestamptz
      UNION ALL
      SELECT rule_id, guide_id, 'open', 1, checked_at, file
      FROM gate_code_results WHERE user_id = ${userId}::uuid AND status = 'owed' AND checked_at >= ${since}::timestamptz
    `) as TallyRow[]
    return { kept: counted.length > 0, records: toRecords(counted), sinceTrial: toRecords(each) }
  } catch (error) {
    if (tableMissing(error)) return { kept: false, records: [], sinceTrial: [] }
    throw error
  }
}
