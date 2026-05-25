import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql, stampEnvelopeOrigin } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export interface Sop {
  id: string
  userId: string
  projectId: string | null
  title: string
  content: string
  category: string | null
  status: 'draft' | 'active' | 'archived'
  orderIndex: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  project: { id: string; name: string } | null
}

function transformSop(row: any): Sop {
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

/**
 * GET /api/sops
 * List the authenticated user's SOPs.
 * Query params: ?status=draft|active|archived  ?projectId=<uuid>  ?search=<text>
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')
    const search = searchParams.get('search')

    const rows = await sql`
      SELECT s.*, p.name AS project_name
      FROM sops s
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.user_id = ${userId}
        AND s.deleted_at IS NULL
        AND (${status}::text IS NULL OR s.status = ${status})
        AND (${projectId}::uuid IS NULL OR s.project_id = ${projectId})
        AND (${search}::text IS NULL OR s.title ILIKE ${'%' + (search ?? '') + '%'} OR s.content ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY s.order_index ASC, s.updated_at DESC
    `

    const sops = rows.map(transformSop)
    const counts = {
      draft: sops.filter(s => s.status === 'draft').length,
      active: sops.filter(s => s.status === 'active').length,
      archived: sops.filter(s => s.status === 'archived').length,
      total: sops.length,
    }
    return successResponse(sops, { counts } as any)
  } catch (error) {
    console.error('GET /api/sops error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load SOPs', 500)
  }
}

/**
 * POST /api/sops
 * Body: { title (required), content?, category?, status?, projectId? }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const body = await request.json()
    const { title, content, category, status, projectId } = body

    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }
    const safeStatus = ['draft', 'active', 'archived'].includes(status) ? status : 'active'

    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this project', 403)
      }
    }

    // Build 5W+H envelope (legacy mode)
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: projectId || undefined, agentId: undefined },
      {
        type: 'sop',
        title: title?.trim(),
        summary: content?.slice(0, 200) || title?.trim(),
        rationale: body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const maxOrder = await sql`
      SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order
      FROM sops WHERE user_id = ${userId} AND deleted_at IS NULL
    `
    const nextOrder = maxOrder[0]?.next_order ?? 0

    const result = await sql`
      INSERT INTO sops (user_id, project_id, title, content, category, status, order_index, documentation_5wh)
      VALUES (
        ${userId},
        ${projectId || null},
        ${title.trim()},
        ${content ?? ''},
        ${category?.trim() || null},
        ${safeStatus},
        ${nextOrder},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(transformSop(result[0]), undefined, 201)
  } catch (error) {
    console.error('POST /api/sops error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create SOP', 500)
  }
}
