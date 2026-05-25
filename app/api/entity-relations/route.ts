/**
 * /api/entity-relations
 *
 * Polymorphic cross-link graph across all planner entities. Powers Gap #3 graph
 * visualization and F2 cross-link UI.
 *
 * GET    list relations (filters: fromType, fromId, toType, toId, relationType, projectId)
 * POST   create relation
 * DELETE soft-delete by id (use /api/entity-relations/[id]/route.ts for that)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

const VALID_RELATION_TYPES = [
  'supersedes',
  'derives_from',
  'related_to',
  'conflicts_with',
  'implements',
  'blocks',
  'part_of',
  'references',
  'promoted_from',
  'addresses',
  'inspired_by',
] as const

export interface EntityRelation {
  id: string
  fromType: string
  fromId: string
  toType: string
  toId: string
  relationType: string
  confidence: number
  userId: string
  createdByType: string
  createdById: string | null
  createdAt: string
  updatedAt: string
  metadata: Record<string, unknown>
  documentation5wh: Record<string, unknown>
}

function transformRow(row: any): EntityRelation {
  return {
    id: row.id,
    fromType: row.from_entity_type,
    fromId: row.from_entity_id,
    toType: row.to_entity_type,
    toId: row.to_entity_id,
    relationType: row.relation_type,
    confidence: Number(row.confidence),
    userId: row.user_id,
    createdByType: row.created_by_type,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata || {},
    documentation5wh: row.documentation_5wh || {},
  }
}

/**
 * GET /api/entity-relations
 * Filters: fromType, fromId, toType, toId, relationType, projectId
 * Returns both directions if either fromId or toId is queried alone (so callers see all edges of a node).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const fromType = sp.get('fromType')
    const fromId = sp.get('fromId')
    const toType = sp.get('toType')
    const toId = sp.get('toId')
    const relationType = sp.get('relationType')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '500', 10) || 500, 2000)

    const rows = await sql`
      SELECT *
      FROM entity_relations
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (${fromType}::text IS NULL OR from_entity_type = ${fromType})
        AND (${fromId}::uuid IS NULL OR from_entity_id = ${fromId})
        AND (${toType}::text IS NULL OR to_entity_type = ${toType})
        AND (${toId}::uuid IS NULL OR to_entity_id = ${toId})
        AND (${relationType}::text IS NULL OR relation_type = ${relationType})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `

    return successResponse(rows.map(transformRow), { total: rows.length })
  } catch (error) {
    console.error('GET /api/entity-relations error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load relations', 500)
  }
}

/**
 * POST /api/entity-relations
 * Body: { fromType, fromId, toType, toId, relationType, confidence?, projectId? (for envelope), rationale? (for envelope) }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const body = await request.json()
    const { fromType, fromId, toType, toId, relationType, confidence, projectId } = body

    // Required fields
    if (!fromType || !fromId || !toType || !toId || !relationType) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'fromType, fromId, toType, toId, relationType are required',
        400
      )
    }

    if (!VALID_RELATION_TYPES.includes(relationType)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `relationType must be one of: ${VALID_RELATION_TYPES.join(', ')}`,
        400
      )
    }

    const safeConfidence = typeof confidence === 'number' && confidence >= 0 && confidence <= 1
      ? confidence
      : 1.0

    // Envelope build
    const envelopeResult = buildEnvelopeForWrite(
      body,
      {
        userId,
        projectId: projectId || undefined,
      },
      {
        type: 'entity_relation',
        title: `${fromType} ${relationType} ${toType}`,
        summary: `Cross-link: ${fromType}/${fromId.slice(0, 8)} → ${relationType} → ${toType}/${toId.slice(0, 8)}`,
        rationale: body?.documentation_5wh?.why?.rationale || `Linked ${fromType}→${toType} as ${relationType}`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    try {
      const result = await sql`
        INSERT INTO entity_relations (
          from_entity_type, from_entity_id, to_entity_type, to_entity_id,
          relation_type, confidence, user_id,
          created_by_type, created_by_id,
          documentation_5wh
        ) VALUES (
          ${fromType}, ${fromId}, ${toType}, ${toId},
          ${relationType}, ${safeConfidence}, ${userId},
          'user', null,
          ${envelopeForSql(envelopeResult.envelope)}::jsonb
        )
        RETURNING *
      `
      return successResponse(transformRow(result[0]), undefined, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return errorResponse(ErrorCodes.CONFLICT, 'Relation already exists', 409)
      }
      throw err
    }
  } catch (error) {
    console.error('POST /api/entity-relations error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create relation', 500)
  }
}
