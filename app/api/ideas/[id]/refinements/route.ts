/**
 * /api/ideas/[id]/refinements
 *
 * Feedback from project execution back to the idea. Surfaced in F1 detail UI.
 *
 * GET  list refinements for an idea (filter: status, refinementType)
 * POST create a new refinement
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

async function userOwnsIdea(ideaId: string, userId: string): Promise<boolean> {
  const r = await sql`
    SELECT id FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return r.length > 0
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: ideaId } = await params

    if (!(await userOwnsIdea(ideaId, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const sp = new URL(request.url).searchParams
    const status = sp.get('status')
    const refinementType = sp.get('refinementType')

    const rows = await sql`
      SELECT r.*, p.name AS source_project_name
      FROM idea_refinements r
      LEFT JOIN projects p ON r.source_project_id = p.id
      WHERE r.idea_id = ${ideaId}
        AND (${status}::text IS NULL OR r.status = ${status}::refinement_status)
        AND (${refinementType}::text IS NULL OR r.refinement_type = ${refinementType}::refinement_type)
      ORDER BY r.created_at DESC
    `
    return successResponse(rows, { total: rows.length })
  } catch (error) {
    console.error('GET /api/ideas/[id]/refinements error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load refinements', 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: ideaId } = await params

    if (!(await userOwnsIdea(ideaId, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const body = await request.json()
    const { sourceProjectId, refinementType, title, description, proposedChanges } = body

    if (!sourceProjectId || !refinementType || !title) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'sourceProjectId, refinementType, title are required',
        400
      )
    }

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: sourceProjectId },
      {
        type: 'idea_refinement',
        title,
        summary: description?.slice(0, 200) || title,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          `Refinement (${refinementType}) on idea from project ${sourceProjectId.slice(0, 8)}`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO idea_refinements (
        idea_id, source_project_id, refinement_type, title, description, proposed_changes, documentation_5wh
      ) VALUES (
        ${ideaId},
        ${sourceProjectId},
        ${refinementType}::refinement_type,
        ${title},
        ${description ?? null},
        ${proposedChanges ? JSON.stringify(proposedChanges) : '{}'},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(result[0], undefined, 201)
  } catch (error) {
    console.error('POST /api/ideas/[id]/refinements error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create refinement', 500)
  }
}
