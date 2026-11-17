/**
 * Titles for the two ends of each find_related edge (Program 1 finding F8, card cfc3cf90).
 *
 * find_related returned bare {type, id} pairs, so every hop cost a follow-up lookup per node. This looks the titles
 * up in one query per entity type, scoped to the caller's own rows (or their projects' rows), and adds them to the
 * edges. A type it does not know keeps no title; nothing else about the edge changes.
 *
 * groupIds and withTitles are pure (check file: entity-titles.assert.ts).
 */

export interface Ref { type: string; id: string }

/** Distinct ids per type, from both ends of every edge. */
export function groupIds(refs: Ref[]): Map<string, string[]> {
  const by = new Map<string, Set<string>>()
  for (const r of refs) {
    if (!r?.type || !r?.id) continue
    const set = by.get(r.type) ?? new Set<string>()
    set.add(String(r.id))
    by.set(r.type, set)
  }
  return new Map([...by].map(([t, s]) => [t, [...s]]))
}

const key = (type: string, id: string) => `${type}:${id}`

/** The same edges, each end given its title when one was found. */
export function withTitles<E extends { from: Ref; to: Ref }>(edges: E[], titles: Map<string, string>): (E & { from: Ref & { title?: string }; to: Ref & { title?: string } })[] {
  const name = (r: Ref) => {
    const t = titles.get(key(r.type, String(r.id)))
    return t ? { ...r, title: t } : { ...r }
  }
  return edges.map((e) => ({ ...e, from: name(e.from), to: name(e.to) }))
}

/** One query per known type, each limited to rows the user owns or can reach through their projects. */
export async function lookupTitles(refs: Ref[], userId: string): Promise<Map<string, string>> {
  const { sql } = await import("@/lib/db/client")
  const out = new Map<string, string>()
  const put = (type: string, rows: Record<string, unknown>[]) => {
    for (const r of rows) if (r.title) out.set(key(type, String(r.id)), String(r.title))
  }
  for (const [type, ids] of groupIds(refs)) {
    try {
      // The table cannot be a query parameter, so each type has its own statement.
      if (type === "idea") put(type, await sql`SELECT id, title FROM ideas WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "todo") put(type, await sql`SELECT id, title FROM todos WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "decision") put(type, await sql`SELECT id, title FROM mlp_why_decisions WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "skill") put(type, await sql`SELECT id, COALESCE(title, name) AS title FROM skills WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "feature_template") put(type, await sql`SELECT id, COALESCE(title, name) AS title FROM feature_templates WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "protocol") put(type, await sql`SELECT id, COALESCE(title, name) AS title FROM protocols WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "prompt") put(type, await sql`SELECT id, name AS title FROM prompts WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "work_order") put(type, await sql`SELECT id, title FROM work_orders WHERE id = ANY(${ids}::uuid[]) AND user_id = ${userId}`)
      else if (type === "project") put(type, await sql`
        SELECT p.id, p.name AS title FROM projects p WHERE p.id = ANY(${ids}::uuid[]) AND p.deleted_at IS NULL
          AND (p.user_id = ${userId} OR EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = ${userId} AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))`)
      else if (type === "project_step" || type === "task") put(type, await sql`
        SELECT s.id, s.title FROM project_steps s JOIN projects p ON p.id = s.project_id
         WHERE s.id = ANY(${ids}::uuid[]) AND s.deleted_at IS NULL
           AND (p.user_id = ${userId} OR EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = ${userId} AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))`)
      else if (type === "document") put(type, await sql`
        SELECT d.id, d.title FROM documents d LEFT JOIN projects p ON p.id = d.project_id
         WHERE d.id = ANY(${ids}::uuid[]) AND (d.user_id = ${userId} OR p.user_id = ${userId})`)
      else if (type === "adr" || type === "architecture_decision") put(type, await sql`
        SELECT a.id, a.title FROM architecture_decisions a JOIN projects p ON p.id = a.project_id
         WHERE a.id = ANY(${ids}::uuid[]) AND p.user_id = ${userId}`)
    } catch (e) {
      // A bad id or a missing table must not cost the edges themselves.
      console.error(`[mcp] find_related titles failed for ${type}:`, e instanceof Error ? e.message : e)
    }
  }
  return out
}
