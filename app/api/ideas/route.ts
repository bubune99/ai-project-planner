import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { IdeaLifecycle } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend Idea format
 * Converts snake_case to camelCase
 */
function transformIdea(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags || [],
    lifecycle: row.lifecycle as IdeaLifecycle,
    promotedToProjectId: row.promoted_to_project_id,
    promotedAt: row.promoted_at,
    visibility: row.visibility,
    canvasSettings: row.canvas_settings || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    // Additional joined data
    projectName: row.project_name,
    facetCount: parseInt(row.facet_count || '0'),
    branchCount: parseInt(row.branch_count || '0'),
    validationCount: parseInt(row.validation_count || '0'),
  }
}

/**
 * GET /api/ideas
 * List ideas for authenticated user with optional filters
 *
 * Query params:
 * - lifecycle: "seed" | "exploring" | "refined" | "promoted" | "archived"
 * - category: string (filter by category)
 * - search: string (search in title/description)
 * - visibility: "private" | "shared" | "public"
 * - includeArchived: "true" (include archived ideas)
 * - projectId: UUID (filter by promoted project)
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const lifecycle = searchParams.get('lifecycle')
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const visibility = searchParams.get('visibility')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const projectId = searchParams.get('projectId')

    // Build the query with counts
    const ideas = await sql`
      SELECT
        i.*,
        p.name as project_name,
        (SELECT COUNT(*) FROM idea_facets f WHERE f.idea_id = i.id) as facet_count,
        (SELECT COUNT(*) FROM idea_branches b WHERE b.idea_id = i.id) as branch_count,
        (SELECT COUNT(*) FROM idea_validations v WHERE v.idea_id = i.id) as validation_count
      FROM ideas i
      LEFT JOIN projects p ON i.promoted_to_project_id = p.id
      WHERE i.user_id = ${userId}
        AND i.deleted_at IS NULL
        ${!includeArchived ? sql`AND i.lifecycle != 'archived'` : sql``}
        ${lifecycle ? sql`AND i.lifecycle = ${lifecycle}` : sql``}
        ${category ? sql`AND i.category = ${category}` : sql``}
        ${visibility ? sql`AND i.visibility = ${visibility}` : sql``}
        ${projectId ? sql`AND i.promoted_to_project_id = ${projectId}` : sql``}
        ${search ? sql`AND (i.title ILIKE ${'%' + search + '%'} OR i.description ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY i.updated_at DESC
    `

    // Transform to frontend format
    const transformedIdeas = ideas.map(transformIdea)

    // Get counts by lifecycle for metadata
    const lifecycleCounts = await sql`
      SELECT
        lifecycle,
        COUNT(*) as count
      FROM ideas
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
      GROUP BY lifecycle
    `

    const counts: Record<string, number> = {}
    for (const row of lifecycleCounts) {
      counts[row.lifecycle] = parseInt(row.count)
    }

    return successResponse(transformedIdeas, {
      total: transformedIdeas.length,
      counts
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get ideas',
      500,
      error.message
    )
  }
}

/**
 * POST /api/ideas
 * Create a new idea
 *
 * Body: { title, description?, category?, tags?, visibility?, canvasSettings?, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { title, description, category, tags, visibility, canvasSettings, metadata } = body

    // Validate required fields
    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }

    // Insert the idea
    const result = await sql`
      INSERT INTO ideas (
        user_id,
        title,
        description,
        category,
        tags,
        lifecycle,
        visibility,
        canvas_settings,
        metadata
      ) VALUES (
        ${userId},
        ${title.trim()},
        ${description?.trim() || null},
        ${category?.trim() || null},
        ${tags || []},
        'seed',
        ${visibility || 'private'},
        ${canvasSettings ? JSON.stringify(canvasSettings) : '{}'},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    const idea = result[0]

    // Create the default 'main' branch for this idea
    await sql`
      INSERT INTO idea_branches (
        idea_id,
        name,
        is_main,
        is_active,
        created_by
      ) VALUES (
        ${idea.id},
        'main',
        true,
        true,
        ${userId}
      )
    `

    // Create default perspective (Business)
    await sql`
      INSERT INTO idea_perspectives (
        idea_id,
        name,
        description,
        is_default
      ) VALUES (
        ${idea.id},
        'Business',
        'Business stakeholder perspective',
        true
      )
    `

    return successResponse(transformIdea({
      ...idea,
      facet_count: 0,
      branch_count: 1,
      validation_count: 0
    }), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/ideas error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create idea',
      500,
      error.message
    )
  }
}
