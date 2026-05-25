/**
 * /api/attempted-solutions
 *
 * First-class capture of failed/abandoned/superseded approaches per entity.
 * Feeds D's failure-recovery prior-art lookup and E's prompt evolution.
 *
 * GET    list for entity (filter: entityType, entityId, outcome)
 * POST   record an attempt
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

const VALID_OUTCOMES = ['failed', 'abandoned', 'superseded', 'inconclusive'] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const entityType = sp.get('entityType')
    const entityId = sp.get('entityId')
    const outcome = sp.get('outcome')
    const projectId = sp.get('projectId')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '100', 10) || 100, 500)

    const rows = await sql`
      SELECT *
      FROM attempted_solutions
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (${entityType}::text IS NULL OR entity_type = ${entityType})
        AND (${entityId}::uuid IS NULL OR entity_id = ${entityId})
        AND (${outcome}::text IS NULL OR outcome = ${outcome})
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
      ORDER BY tried_at DESC
      LIMIT ${limit}
    `
    return successResponse(rows, { total: rows.length })
  } catch (error) {
    console.error('GET /api/attempted-solutions error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load attempts', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const body = await request.json()

    const {
      entityType,
      entityId,
      approach,
      approachDetail,
      outcome,
      failureMode,
      rootCause,
      lessonsLearned,
      preventionStrategy,
      supersededByEntityType,
      supersededByEntityId,
      projectId,
      attemptedByType,
      attemptedById,
    } = body

    if (!entityType || !entityId || !approach || !lessonsLearned || !outcome) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'entityType, entityId, approach, outcome, lessonsLearned are required',
        400
      )
    }
    if (!VALID_OUTCOMES.includes(outcome)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`,
        400
      )
    }

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: projectId || undefined },
      {
        type: 'attempted_solution',
        title: `Attempted: ${String(approach).slice(0, 80)}`,
        summary: `${outcome} approach against ${entityType}: ${String(approach).slice(0, 200)}`,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          lessonsLearned ||
          `Recorded ${outcome} attempt on ${entityType}`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO attempted_solutions (
        entity_type, entity_id, approach, approach_detail, outcome,
        failure_mode, root_cause, lessons_learned, prevention_strategy,
        superseded_by_entity_type, superseded_by_entity_id,
        user_id, project_id, attempted_by_type, attempted_by_id,
        documentation_5wh
      ) VALUES (
        ${entityType}, ${entityId}, ${approach}, ${approachDetail ?? null}, ${outcome},
        ${failureMode ?? null}, ${rootCause ?? null}, ${lessonsLearned}, ${preventionStrategy ?? null},
        ${supersededByEntityType ?? null}, ${supersededByEntityId ?? null},
        ${userId}, ${projectId ?? null}, ${attemptedByType ?? 'user'}, ${attemptedById ?? null},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(result[0], undefined, 201)
  } catch (error) {
    console.error('POST /api/attempted-solutions error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to record attempt', 500)
  }
}
