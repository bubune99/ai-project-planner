/**
 * /api/entity-relations/[id]
 * PATCH  update confidence / metadata
 * DELETE soft-delete (sets deleted_at)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const body = await request.json()
    const { confidence, metadata } = body

    const existing = await sql`
      SELECT * FROM entity_relations
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (!existing.length) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Relation not found', 404)
    }

    const newConfidence = typeof confidence === 'number' && confidence >= 0 && confidence <= 1
      ? confidence
      : existing[0].confidence
    const newMetadata = metadata && typeof metadata === 'object'
      ? { ...existing[0].metadata, ...metadata }
      : existing[0].metadata

    const result = await sql`
      UPDATE entity_relations
         SET confidence = ${newConfidence},
             metadata = ${JSON.stringify(newMetadata)}::jsonb,
             updated_at = NOW()
       WHERE id = ${id} AND user_id = ${userId}
       RETURNING *
    `
    return successResponse(result[0])
  } catch (error) {
    console.error('PATCH /api/entity-relations/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update relation', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params

    const result = await sql`
      UPDATE entity_relations
         SET deleted_at = NOW()
       WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
       RETURNING id
    `
    if (!result.length) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Relation not found', 404)
    }
    return successResponse({ id: result[0].id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/entity-relations/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete relation', 500)
  }
}
