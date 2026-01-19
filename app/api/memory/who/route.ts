import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformCollaborator(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    collaboratorType: row.collaborator_type,
    linkedUserId: row.linked_user_id,
    expertise: row.expertise || [],
    contactInfo: row.contact_info || {},
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Include contribution count if available
    contributionCount: row.contribution_count ? parseInt(row.contribution_count) : undefined
  }
}

/**
 * GET /api/memory/who
 * List collaborators with optional filters
 *
 * Query params:
 * - type: "human" | "ai" | "team" | "service"
 * - expertise: string (filter by expertise area)
 * - search: string (search in name or notes)
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

    const type = searchParams.get('type')
    const expertise = searchParams.get('expertise')
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const collaborators = await sql`
      SELECT
        c.*,
        COUNT(DISTINCT cont.id) as contribution_count
      FROM mlp_who_collaborators c
      LEFT JOIN mlp_who_contributions cont ON cont.collaborator_id = c.id
      WHERE c.user_id = ${userId}
        ${type ? sql`AND c.collaborator_type = ${type}` : sql``}
        ${expertise ? sql`AND ${expertise} = ANY(c.expertise)` : sql``}
        ${search ? sql`AND (c.name ILIKE ${'%' + search + '%'} OR c.notes ILIKE ${'%' + search + '%'})` : sql``}
      GROUP BY c.id
      ORDER BY c.name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    const countResult = await sql`
      SELECT COUNT(*) as total FROM mlp_who_collaborators
      WHERE user_id = ${userId}
        ${type ? sql`AND collaborator_type = ${type}` : sql``}
        ${expertise ? sql`AND ${expertise} = ANY(expertise)` : sql``}
        ${search ? sql`AND (name ILIKE ${'%' + search + '%'} OR notes ILIKE ${'%' + search + '%'})` : sql``}
    `

    return successResponse(collaborators.map(transformCollaborator), {
      total: parseInt(countResult[0]?.total || '0'),
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/who error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get collaborators',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/who
 * Create a collaborator record
 *
 * Body: {
 *   name: string (required)
 *   collaboratorType: "human" | "ai" | "team" | "service" (required)
 *   linkedUserId?: UUID (link to actual user)
 *   expertise?: string[]
 *   contactInfo?: object
 *   notes?: string
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
      name,
      collaboratorType,
      linkedUserId,
      expertise,
      contactInfo,
      notes
    } = body

    // Validate required fields
    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Name is required', 400)
    }

    const validTypes = ['human', 'ai', 'team', 'service']
    if (!collaboratorType || !validTypes.includes(collaboratorType)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Collaborator type is required and must be one of: ${validTypes.join(', ')}`,
        400
      )
    }

    const result = await sql`
      INSERT INTO mlp_who_collaborators (
        user_id,
        name,
        collaborator_type,
        linked_user_id,
        expertise,
        contact_info,
        notes
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${collaboratorType},
        ${linkedUserId || null},
        ${expertise || []},
        ${contactInfo ? JSON.stringify(contactInfo) : '{}'},
        ${notes?.trim() || null}
      )
      RETURNING *
    `

    return successResponse(transformCollaborator(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/who error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create collaborator',
      500,
      error.message
    )
  }
}
