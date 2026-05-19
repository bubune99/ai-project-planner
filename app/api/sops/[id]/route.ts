import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformSop(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    category: row.category,
    status: row.status,
    orderIndex: row.order_index,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    project: row.project_name ? { id: row.project_id, name: row.project_name } : null,
  }
}

async function ownedSop(id: string, userId: string) {
  const rows = await sql`
    SELECT 1 FROM sops WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return rows.length > 0
}

/** GET /api/sops/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const rows = await sql`
      SELECT s.*, p.name AS project_name
      FROM sops s LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.id = ${params.id} AND s.user_id = ${authContext.userId} AND s.deleted_at IS NULL
    `
    if (rows.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'SOP not found', 404)
    return successResponse(transformSop(rows[0]))
  } catch (error) {
    console.error('GET /api/sops/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load SOP', 500)
  }
}

/** PATCH /api/sops/[id]  Body: any of { title, content, category, status, projectId } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext
    if (!(await ownedSop(params.id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'SOP not found', 404)
    }
    const body = await request.json()
    const { title, content, category, status, projectId } = body

    if (title !== undefined && !title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title cannot be empty', 400)
    }
    if (status !== undefined && !['draft', 'active', 'archived'].includes(status)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid status', 400)
    }
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) return errorResponse(ErrorCodes.FORBIDDEN, 'No access to that project', 403)
    }

    // COALESCE keeps the existing value when a field is omitted (passed null).
    // category/project_id follow the same rule: omit to keep, send a value to change.
    const result = await sql`
      UPDATE sops SET
        title      = COALESCE(${title ?? null}, title),
        content    = COALESCE(${content ?? null}, content),
        category   = COALESCE(${category !== undefined ? (category?.trim() || null) : null}, category),
        status     = COALESCE(${status ?? null}, status),
        project_id = COALESCE(${projectId !== undefined ? (projectId || null) : null}, project_id),
        updated_at = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'SOP not found', 404)
    return successResponse(transformSop(result[0]))
  } catch (error) {
    console.error('PATCH /api/sops/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update SOP', 500)
  }
}

/** DELETE /api/sops/[id]  (soft delete) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const result = await sql`
      UPDATE sops SET deleted_at = NOW()
      WHERE id = ${params.id} AND user_id = ${authContext.userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'SOP not found', 404)
    return successResponse({ id: params.id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/sops/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete SOP', 500)
  }
}
