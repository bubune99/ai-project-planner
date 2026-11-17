/**
 * Ships: what went live and which pages it touched (migration 070). The rules are in fresh-model.ts.
 * Every read returns "no reports" when the table is not there yet, so nothing breaks before the migration.
 */
import { sql } from "@/lib/db/client"
import { freshness, parseShip, staleCount, type Ship } from "./fresh-model"

const iso = (d: string | Date) => new Date(d).toISOString()

export async function listShips(projectId: string, limit = 200): Promise<{ available: boolean; ships: Ship[] }> {
  try {
    const rows = (await sql`
      SELECT sha, env, routes, everywhere, shipped_at FROM gate_ships WHERE project_id = ${projectId} ORDER BY shipped_at DESC LIMIT ${limit}
    `) as { sha: string; env: string; routes: string[]; everywhere: boolean; shipped_at: string }[]
    return { available: true, ships: rows.map((r) => ({ sha: r.sha, env: r.env, routes: Array.isArray(r.routes) ? r.routes : [], everywhere: r.everywhere, at: iso(r.shipped_at) })) }
  } catch {
    return { available: false, ships: [] }
  }
}

/** Records a ship. Reporting the same commit to the same place again adds to what it touched; it never removes. */
export async function recordShip(a: { projectId: string; userId: string; raw: unknown }) {
  const s = parseShip(a.raw)
  const [row] = (await sql`
    INSERT INTO gate_ships (project_id, env, sha, routes, everywhere, files, note, created_by, shipped_at)
    VALUES (${a.projectId}, ${s.env}, ${s.sha}, ${JSON.stringify(s.routes)}::jsonb, ${s.everywhere}, ${s.files}, ${s.note}, ${a.userId}, COALESCE(${s.at}::timestamptz, now()))
    ON CONFLICT (project_id, env, sha) DO UPDATE SET
      routes = (SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb) FROM jsonb_array_elements_text(gate_ships.routes || EXCLUDED.routes) AS r),
      everywhere = gate_ships.everywhere OR EXCLUDED.everywhere,
      files = GREATEST(gate_ships.files, EXCLUDED.files),
      note = COALESCE(EXCLUDED.note, gate_ships.note)
    RETURNING sha, env, routes, everywhere, shipped_at
  `) as { sha: string; env: string; routes: string[]; everywhere: boolean; shipped_at: string }[]
  return { sha: row.sha, env: row.env, routes: row.routes, everywhere: row.everywhere, at: iso(row.shipped_at) }
}

/** Every scanned page of a project with where its newest picture stands, and the project's one line. */
export async function projectFreshness(projectId: string) {
  const { available, ships } = await listShips(projectId)
  let pages: { id: string; route: string; captured_at: string | null }[] = []
  try {
    pages = (await sql`
      SELECT DISTINCT ON (c.route) c.id, c.route,
        (SELECT max(i.captured_at) FROM gate_images i WHERE i.checklist_id = c.id AND i.kind = 'view' AND i.deleted_at IS NULL) AS captured_at
      FROM gate_checklists c WHERE c.project_id = ${projectId} ORDER BY c.route, c.version DESC
    `) as typeof pages
  } catch { pages = [] }
  const reports = available && ships.length > 0
  const byPage = pages.map((p) => ({ id: p.id, route: p.route, capturedAt: p.captured_at ? iso(p.captured_at) : null, ...freshness({ capturedAt: p.captured_at ? iso(p.captured_at) : null, route: p.route, ships, projectReports: reports }) }))
  return { reports, lastShip: ships.find((s) => s.env !== "report") ?? null, pages: byPage, ...staleCount(byPage) }
}
