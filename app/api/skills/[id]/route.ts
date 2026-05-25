import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformSkill(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    name: row.name,
    title: row.title,
    category: row.category,
    description: row.description,
    whenToUse: row.when_to_use,
    body: row.body,
    prerequisites: row.prerequisites || [],
    provides: row.provides || [],
    examples: row.examples || [],
    status: row.status,
    version: row.version,
    supersededBySkillId: row.superseded_by_skill_id,
    usageCount: row.usage_count,
    successCount: row.success_count,
    failureCount: row.failure_count,
    lastUsedAt: row.last_used_at,
    visibility: row.visibility,
    metadata: row.metadata || {},
    documentation5wh: row.documentation_5wh || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ownedSkill(id: string, userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM skills WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return rows.length > 0
}

/** GET /api/skills/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const rows = await sql`
      SELECT * FROM skills
      WHERE id = ${params.id} AND user_id = ${authContext.userId} AND deleted_at IS NULL
    `
    if (rows.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Skill not found', 404)
    return successResponse(transformSkill(rows[0] as Record<string, unknown>))
  } catch (error) {
    console.error('GET /api/skills/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load skill', 500)
  }
}

/** PATCH /api/skills/[id] */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext
    if (!(await ownedSkill(params.id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Skill not found', 404)
    }
    const body = await request.json()
    const { title, description, category, status, visibility, projectId, whenToUse, body: skillBody } = body

    if (title !== undefined && !title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'title cannot be empty', 400)
    }
    if (status !== undefined && !['draft', 'active', 'deprecated'].includes(status)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid status', 400)
    }
    if (visibility !== undefined && !['private', 'project', 'public'].includes(visibility)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid visibility', 400)
    }
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) return errorResponse(ErrorCodes.FORBIDDEN, 'No access to that project', 403)
    }

    const existing = await sql`
      SELECT documentation_5wh, project_id FROM skills
      WHERE id = ${params.id} AND user_id = ${userId}
    `
    const mergeResult = mergeEnvelopeForPatch(
      existing[0]?.documentation_5wh as Record<string, unknown>,
      body,
      {
        userId,
        projectId: (projectId !== undefined ? projectId : existing[0]?.project_id) ?? undefined,
        agentId: undefined,
      },
      {
        type: 'skill',
        title: title || undefined,
        summary: description?.slice(0, 200) || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/skills/[id]',
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    const result = await sql`
      UPDATE skills SET
        title        = COALESCE(${title ?? null}, title),
        description  = COALESCE(${description ?? null}, description),
        category     = COALESCE(${category !== undefined ? (category?.trim() || null) : null}, category),
        status       = COALESCE(${status ?? null}, status),
        visibility   = COALESCE(${visibility ?? null}, visibility),
        project_id   = COALESCE(${projectId !== undefined ? (projectId || null) : null}, project_id),
        when_to_use  = COALESCE(${whenToUse !== undefined ? (whenToUse?.trim() || null) : null}, when_to_use),
        body         = COALESCE(${skillBody ?? null}, body),
        documentation_5wh = ${envelopeForSql(mergeResult.envelope)}::jsonb,
        updated_at   = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Skill not found', 404)
    return successResponse(transformSkill(result[0] as Record<string, unknown>))
  } catch (error) {
    console.error('PATCH /api/skills/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update skill', 500)
  }
}

/** DELETE /api/skills/[id]  (soft delete) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const result = await sql`
      UPDATE skills SET deleted_at = NOW()
      WHERE id = ${params.id} AND user_id = ${authContext.userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Skill not found', 404)
    return successResponse({ id: params.id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/skills/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete skill', 500)
  }
}
