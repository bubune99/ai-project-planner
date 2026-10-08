/**
 * /api/envelope-search — Phase 11 / G L3
 *
 * Cross-entity full-text search over the envelope_search_index materialized view.
 *
 * GET ?q=<text>          — required: search query
 *     ?entityTypes=a,b   — restrict to entity types
 *     ?projectId=        — restrict to a project
 *     ?limit=            — default 30, max 100
 *
 * Returns: ranked hits with entity_type, entity_id, title, summary, snippet, rank.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const q = sp.get('q')?.trim()
    if (!q) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'q required', 400)
    const entityTypes = sp.get('entityTypes')?.split(',').filter(Boolean) ?? null
    const projectId = sp.get('projectId')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '30', 10) || 30, 100)

    const rows = await sql`
      SELECT
        entity_type,
        entity_id,
        title,
        summary,
        env_what_type,
        env_why_rationale,
        ts_rank(search_vector, websearch_to_tsquery('english', ${q})) AS rank,
        ts_headline(
          'english',
          COALESCE(summary, '') || ' ' || COALESCE(documentation_5wh->'why'->>'rationale', ''),
          websearch_to_tsquery('english', ${q}),
          'MaxFragments=2, MinWords=3, MaxWords=15'
        ) AS snippet,
        updated_at
      FROM envelope_search_index esi
      WHERE (
          esi.user_id = ${userId}
          -- Migration 047 writes a NULL user_id for nine entity types. A NULL
          -- owner is not "public": resolve the real owner at query time.
          OR (esi.user_id IS NULL AND (
            (esi.project_id IS NOT NULL AND (
              EXISTS (SELECT 1 FROM projects p
                      WHERE p.id = esi.project_id AND p.user_id = ${userId} AND p.deleted_at IS NULL)
              OR EXISTS (SELECT 1 FROM project_collaborators pc
                         WHERE pc.project_id = esi.project_id AND pc.user_id = ${userId}
                           AND pc.removed_at IS NULL AND pc.accepted_at IS NOT NULL)
            ))
            OR (esi.entity_type = 'document' AND EXISTS (
              SELECT 1 FROM documents d WHERE d.id = esi.entity_id AND d.user_id = ${userId}))
            OR (esi.entity_type = 'agent_job' AND EXISTS (
              SELECT 1 FROM agent_jobs j WHERE j.id = esi.entity_id AND j.created_by = ${userId}))
            OR (esi.entity_type = 'idea_facet' AND EXISTS (
              SELECT 1 FROM idea_facets f JOIN ideas i ON i.id = f.idea_id
              WHERE f.id = esi.entity_id AND i.user_id = ${userId}))
            OR (esi.entity_type = 'idea_document' AND EXISTS (
              SELECT 1 FROM idea_documents idoc JOIN ideas i ON i.id = idoc.idea_id
              WHERE idoc.id = esi.entity_id AND i.user_id = ${userId}))
            OR (esi.entity_type = 'idea_refinement' AND EXISTS (
              SELECT 1 FROM idea_refinements r JOIN ideas i ON i.id = r.idea_id
              WHERE r.id = esi.entity_id AND i.user_id = ${userId}))
            OR (esi.entity_type = 'work_order_step' AND EXISTS (
              SELECT 1 FROM work_order_steps ws JOIN work_orders wo ON wo.id = ws.work_order_id
              WHERE ws.id = esi.entity_id AND wo.user_id = ${userId}))
          ))
        )
        AND search_vector @@ websearch_to_tsquery('english', ${q})
        AND (${entityTypes}::text[] IS NULL OR entity_type = ANY(${entityTypes}::text[]))
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
      ORDER BY rank DESC, updated_at DESC NULLS LAST
      LIMIT ${limit}
    `
    return successResponse(rows, { total: rows.length, query: q })
  } catch (error) {
    console.error('GET /api/envelope-search error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Search failed', 500)
  }
}

/**
 * POST /api/envelope-search/refresh — admin: refresh the materialized view
 * (CONCURRENT refresh keeps the view available during rebuild)
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const started = Date.now()
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY envelope_search_index`
    const r = await sql`SELECT COUNT(*)::int AS n FROM envelope_search_index`
    return successResponse({ refreshed: true, indexedRows: r[0].n, durationMs: Date.now() - started })
  } catch (error) {
    console.error('POST /api/envelope-search refresh error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Refresh failed', 500)
  }
}
