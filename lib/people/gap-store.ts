/** What a project's People and flows still lacks: gathers the document, scanned pages, walks, ships and open requests. Rules in gaps.ts; callers check access first. */
import { sql } from "@/lib/db/client"
import { loadFlows } from "./store"
import { listShips } from "@/lib/gates/ship-store"
import { peopleGaps, gapSummary } from "./gaps"

export async function projectGaps(projectId: string) {
  const [flows, pages, walks, ships, requests] = await Promise.all([
    loadFlows(projectId),
    sql`SELECT DISTINCT route FROM gate_checklists WHERE project_id = ${projectId}` as unknown as Promise<{ route: string }[]>,
    sql`SELECT doc->>'useCase' AS use_case, doc->>'outcome' AS outcome, doc->'covers' AS covers, doc->>'way' AS way, doc->>'build' AS build, created_at FROM walks WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 400` as unknown as Promise<{ use_case: string | null; covers: unknown; way: string | null; build: string | null; outcome: string | null; created_at: string }[]>,
    listShips(projectId, 400),
    sql`
      SELECT id, title, metadata->'proposal'->>'useCase' AS use_case FROM project_steps
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND metadata ? 'proposal'
        AND status IN ('requested', 'pending', 'in-progress', 'blocked')
    ` as unknown as Promise<{ id: string; title: string; use_case: string | null }[]>,
  ])
  const gaps = peopleGaps({
    doc: flows.doc,
    pages: pages.map((p) => p.route),
    walks: walks.map((w) => ({ useCase: w.use_case ?? undefined, outcome: w.outcome ?? "", at: new Date(w.created_at).toISOString(), ...(Array.isArray(w.covers) ? { covers: w.covers.filter((x): x is string => typeof x === "string") } : {}), ...(w.way ? { way: w.way } : {}), ...(w.build ? { build: w.build } : {}) })),
    ships: ships.ships,
    requests: requests.map((r) => ({ id: r.id, title: r.title, useCase: r.use_case })),
  })
  return { gaps, summary: gapSummary(gaps), version: flows.version }
}
