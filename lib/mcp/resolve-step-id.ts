/**
 * Task ids as agents write them: the full uuid, or the short form other tools print
 * (gates shows 8 characters, e.g. "0f9af3f9"). A short id is matched only among
 * tasks the caller can reach, and an ambiguous or unknown one gets a plain answer,
 * never a Postgres "invalid input syntax for type uuid".
 *
 * Found 2026-11-17: `gates queue done 52e9dd5d` worked but `add_task_comment`
 * with "0f9af3f9" failed with that Postgres error.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIX = /^[0-9a-f]{6}[0-9a-f-]{0,29}$/i

export type IdKind = { kind: "uuid"; id: string } | { kind: "prefix"; prefix: string } | { kind: "invalid"; reason: string }

/** What the caller wrote: a full id, a usable prefix, or something that cannot be a task id. Pure. */
export function classifyStepId(input: string): IdKind {
  const s = String(input ?? "").trim()
  if (UUID.test(s)) return { kind: "uuid", id: s.toLowerCase() }
  if (PREFIX.test(s)) return { kind: "prefix", prefix: s.toLowerCase() }
  if (/^[0-9a-f-]{1,5}$/i.test(s)) return { kind: "invalid", reason: `"${s}" is too short: give at least 6 characters of the task id` }
  return { kind: "invalid", reason: `"${s}" is not a task id` }
}

export interface StepMatch { id: string; title: string }

/** The answer for a prefix, given the tasks it matched (at most a few). Pure. */
export function pickStep(prefix: string, matches: StepMatch[]): { id: string } | { error: string } {
  if (matches.length === 1) return { id: matches[0].id }
  if (matches.length === 0) return { error: `No task starting with "${prefix}" in your projects` }
  const list = matches.slice(0, 5).map((m) => `${m.id} (${m.title})`).join("; ")
  return { error: `"${prefix}" matches ${matches.length > 5 ? "more than 5" : matches.length} tasks: ${list}. Give more of the id.` }
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>

/**
 * Resolve to a full task id, or throw an Error whose message is meant for the agent.
 * A prefix is searched only in projects the user owns or collaborates on (accepted, not removed).
 */
export async function resolveStepId(sql: Sql, userId: string, input: string): Promise<string> {
  const c = classifyStepId(input)
  if (c.kind === "uuid") return c.id
  if (c.kind === "invalid") throw new Error(c.reason)
  const like = `${c.prefix.replace(/[%_\\]/g, "")}%`
  const rows = await sql`
    SELECT ps.id::text AS id, ps.title
    FROM project_steps ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.id::text LIKE ${like}
      AND ps.deleted_at IS NULL
      AND (
        p.user_id = ${userId}
        OR EXISTS (
          SELECT 1 FROM project_collaborators pc
          WHERE pc.project_id = p.id AND pc.user_id = ${userId}
            AND pc.removed_at IS NULL AND pc.accepted_at IS NOT NULL
        )
      )
    LIMIT 6
  `
  const r = pickStep(c.prefix, rows.map((x) => ({ id: String(x.id), title: String(x.title ?? "") })))
  if ("error" in r) throw new Error(r.error)
  return r.id
}
