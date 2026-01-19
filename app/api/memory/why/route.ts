import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformDecision(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    ideaId: row.idea_id,
    title: row.title,
    status: row.status,
    summary: row.summary,
    tags: row.tags || [],
    domains: row.domains || [],
    stakeholders: row.stakeholders || [],
    businessDrivers: row.business_drivers || [],
    technicalConstraints: row.technical_constraints || [],
    futureConsiderations: row.future_considerations || [],
    compressionLevel: row.compression_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Include related counts if available
    nodeCount: row.node_count ? parseInt(row.node_count) : undefined,
    attemptCount: row.attempt_count ? parseInt(row.attempt_count) : undefined
  }
}

/**
 * GET /api/memory/why
 * List decision episodes with optional filters
 *
 * Query params:
 * - projectId: UUID (filter by project)
 * - ideaId: UUID (filter by idea)
 * - status: "active" | "resolved" | "revisit" | "deprecated"
 * - domain: string (filter by domain)
 * - tag: string (filter by tag)
 * - search: string (full-text search in title/summary)
 * - limit: number (default 50)
 * - offset: number (pagination)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const projectId = searchParams.get('projectId')
    const ideaId = searchParams.get('ideaId')
    const status = searchParams.get('status')
    const domain = searchParams.get('domain')
    const tag = searchParams.get('tag')
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query with counts of related records
    const decisions = await sql`
      SELECT
        d.*,
        COUNT(DISTINCT n.id) as node_count,
        COUNT(DISTINCT a.id) as attempt_count
      FROM mlp_why_decisions d
      LEFT JOIN mlp_why_nodes n ON n.episode_id = d.id
      LEFT JOIN mlp_why_attempts a ON a.episode_id = d.id
      WHERE d.user_id = ${userId}
        ${projectId ? sql`AND d.project_id = ${projectId}` : sql``}
        ${ideaId ? sql`AND d.idea_id = ${ideaId}` : sql``}
        ${status ? sql`AND d.status = ${status}` : sql``}
        ${domain ? sql`AND ${domain} = ANY(d.domains)` : sql``}
        ${tag ? sql`AND ${tag} = ANY(d.tags)` : sql``}
        ${search ? sql`AND to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.summary, '')) @@ plainto_tsquery('english', ${search})` : sql``}
      GROUP BY d.id
      ORDER BY d.updated_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total FROM mlp_why_decisions
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${domain ? sql`AND ${domain} = ANY(domains)` : sql``}
        ${tag ? sql`AND ${tag} = ANY(tags)` : sql``}
        ${search ? sql`AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')) @@ plainto_tsquery('english', ${search})` : sql``}
    `

    return successResponse(decisions.map(transformDecision), {
      total: parseInt(countResult[0]?.total || '0'),
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/why error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get decisions',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/why
 * Create a new decision episode
 *
 * Body: {
 *   title: string (required)
 *   projectId?: UUID
 *   ideaId?: UUID
 *   summary?: string
 *   tags?: string[]
 *   domains?: string[]
 *   stakeholders?: string[]
 *   businessDrivers?: string[]
 *   technicalConstraints?: string[]
 *   futureConsiderations?: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()

    const {
      title,
      projectId,
      ideaId,
      summary,
      tags,
      domains,
      stakeholders,
      businessDrivers,
      technicalConstraints,
      futureConsiderations
    } = body

    // Validate required fields
    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }

    // Verify project access if projectId provided
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'No access to this project', 403)
      }
    }

    // Insert the decision
    const result = await sql`
      INSERT INTO mlp_why_decisions (
        user_id,
        project_id,
        idea_id,
        title,
        summary,
        tags,
        domains,
        stakeholders,
        business_drivers,
        technical_constraints,
        future_considerations
      ) VALUES (
        ${userId},
        ${projectId || null},
        ${ideaId || null},
        ${title.trim()},
        ${summary?.trim() || null},
        ${tags || []},
        ${domains || []},
        ${stakeholders || []},
        ${businessDrivers || []},
        ${technicalConstraints || []},
        ${futureConsiderations || []}
      )
      RETURNING *
    `

    return successResponse(transformDecision(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/why error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create decision',
      500,
      error.message
    )
  }
}
