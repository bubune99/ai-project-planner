/**
 * /api/knowledge-graph
 *
 * Aggregates entity_relations + resolves nodes into a graph-friendly response.
 * Powers Phase 8 (Gap #3) — the cross-link visualization.
 *
 * GET ?projectId=  ?entityTypes=idea,decision  ?relationTypes=supersedes,promoted_from
 *     ?focusEntityType=&focusEntityId= (centers graph on a single node, 2 hops out)
 *
 * Response shape (graph-ready for Cytoscape / D3 / Visx):
 * {
 *   nodes: [{ id, type, title, summary, lifecycle?, status? }, ...],
 *   edges: [{ id, source, target, type, confidence, createdAt }, ...],
 *   counts: { nodes, edges, byType: { idea: 5, decision: 3, ... } }
 * }
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { nodeQueries, placeholderNode, toNode, type GraphNode } from '@/lib/knowledge-graph/lookup'

export const dynamic = 'force-dynamic'

type GraphEdge = {
  id: string
  source: string
  target: string
  sourceType: string
  targetType: string
  type: string
  confidence: number
  createdAt: string
}

/**
 * Look up one item. The query proves it belongs to the caller (see
 * lib/knowledge-graph/lookup.ts); anything else comes back as a bare dot.
 */
async function resolveNode(entityType: string, entityId: string, userId: string): Promise<GraphNode> {
  for (const q of nodeQueries(entityType)) {
    try {
      const rows = await sql.query(q.text, [entityId, userId])
      if (rows[0]) return toNode(entityType, entityId, q.lookup, rows[0])
    } catch (error) {
      console.error(`knowledge-graph: lookup failed for ${entityType} in ${q.lookup.table}`, error)
    }
  }
  return placeholderNode(entityType, entityId)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const entityTypes = sp.get('entityTypes')?.split(',').filter(Boolean) ?? null
    const relationTypes = sp.get('relationTypes')?.split(',').filter(Boolean) ?? null
    const focusEntityType = sp.get('focusEntityType')
    const focusEntityId = sp.get('focusEntityId')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '500', 10), 2000)

    let edgeRows: any[]

    if (focusEntityType && focusEntityId) {
      // 2-hop neighborhood centered on the focus node
      edgeRows = await sql`
        WITH RECURSIVE neighborhood AS (
          SELECT * FROM entity_relations
            WHERE user_id = ${userId} AND deleted_at IS NULL
              AND ((from_entity_type = ${focusEntityType} AND from_entity_id = ${focusEntityId})
                OR (to_entity_type = ${focusEntityType} AND to_entity_id = ${focusEntityId}))
          UNION
          SELECT er.* FROM entity_relations er
          INNER JOIN neighborhood n ON
              (er.from_entity_type = n.to_entity_type AND er.from_entity_id = n.to_entity_id)
           OR (er.to_entity_type = n.from_entity_type AND er.to_entity_id = n.from_entity_id)
            WHERE er.user_id = ${userId} AND er.deleted_at IS NULL
        )
        SELECT DISTINCT * FROM neighborhood LIMIT ${limit}
      `
    } else {
      edgeRows = await sql`
        SELECT * FROM entity_relations
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND (${relationTypes}::text[] IS NULL OR relation_type = ANY(${relationTypes}::text[]))
          AND (${entityTypes}::text[] IS NULL OR from_entity_type = ANY(${entityTypes}::text[]) OR to_entity_type = ANY(${entityTypes}::text[]))
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    }

    // Collect unique node IDs
    const nodeKeys = new Set<string>()
    for (const r of edgeRows) {
      nodeKeys.add(`${r.from_entity_type}::${r.from_entity_id}`)
      nodeKeys.add(`${r.to_entity_type}::${r.to_entity_id}`)
    }

    // Resolve all nodes in parallel
    const nodes: GraphNode[] = []
    await Promise.all(
      Array.from(nodeKeys).map(async (key) => {
        const [type, id] = key.split('::')
        nodes.push(await resolveNode(type, id, userId))
      })
    )

    const edges: GraphEdge[] = edgeRows.map((r) => ({
      id: r.id,
      source: r.from_entity_id,
      target: r.to_entity_id,
      sourceType: r.from_entity_type,
      targetType: r.to_entity_type,
      type: r.relation_type,
      confidence: Number(r.confidence),
      createdAt: r.created_at,
    }))

    const byType: Record<string, number> = {}
    for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    return successResponse({
      nodes,
      edges,
      counts: {
        nodes: nodes.length,
        edges: edges.length,
        byType,
      },
    })
  } catch (error) {
    console.error('GET /api/knowledge-graph error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to build graph', 500)
  }
}
