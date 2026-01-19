import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FacetType } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend IdeaFacet format
 */
function transformFacet(row: any) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    branchId: row.branch_id,
    facetType: row.facet_type as FacetType,
    name: row.name,
    data: row.data || {},
    positionX: row.position_x,
    positionY: row.position_y,
    orderIndex: row.order_index,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Verify user has access to an idea
 */
async function verifyIdeaAccess(ideaId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT id FROM ideas
    WHERE id = ${ideaId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
  `
  return result.length > 0
}

/**
 * Get default facet data structure based on type
 */
function getDefaultFacetData(facetType: FacetType): object {
  switch (facetType) {
    case 'pros_cons':
      return { pros: [], cons: [], summary: '' }
    case 'timeline':
      return { milestones: [] }
    case 'market_research':
      return { targetMarket: '', competitors: [], marketSize: '', trends: [] }
    case 'technical_specs':
      return { requirements: [], constraints: [], stack: [] }
    case 'financials':
      return { costs: [], revenue: [], breakeven: null, projections: [] }
    case 'dependencies':
      return { internal: [], external: [], risks: [] }
    case 'risks':
      return { risks: [] }
    case 'alternatives':
      return { alternatives: [] }
    case 'custom':
      return { schema: null, data: {} }
    default:
      return {}
  }
}

/**
 * GET /api/ideas/[id]/facets
 * List all facets for an idea
 *
 * Query params:
 * - branchId: UUID (filter by branch, null for all)
 * - type: FacetType (filter by facet type)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Verify access
    if (!(await verifyIdeaAccess(id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')
    const facetType = searchParams.get('type')

    const facets = await sql`
      SELECT f.*, b.name as branch_name
      FROM idea_facets f
      LEFT JOIN idea_branches b ON f.branch_id = b.id
      WHERE f.idea_id = ${id}
        ${branchId ? sql`AND f.branch_id = ${branchId}` : sql``}
        ${facetType ? sql`AND f.facet_type = ${facetType}` : sql``}
      ORDER BY f.order_index ASC, f.created_at ASC
    `

    const transformedFacets = facets.map(f => ({
      ...transformFacet(f),
      branchName: f.branch_name
    }))

    return successResponse(transformedFacets, {
      total: transformedFacets.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/facets error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get facets',
      500,
      error.message
    )
  }
}

/**
 * POST /api/ideas/[id]/facets
 * Create a new facet for an idea
 *
 * Body: { facetType, name?, data?, branchId?, positionX?, positionY?, metadata? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Verify access
    if (!(await verifyIdeaAccess(id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const body = await request.json()
    const { facetType, name, data, branchId, positionX, positionY, metadata } = body

    // Validate facet type
    const validFacetTypes: FacetType[] = [
      'pros_cons', 'timeline', 'market_research', 'technical_specs',
      'financials', 'dependencies', 'risks', 'alternatives', 'custom'
    ]
    if (!facetType || !validFacetTypes.includes(facetType)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid facet type', 400)
    }

    // If branchId provided, verify it belongs to this idea
    if (branchId) {
      const branchCheck = await sql`
        SELECT id FROM idea_branches
        WHERE id = ${branchId} AND idea_id = ${id}
      `
      if (branchCheck.length === 0) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid branch ID', 400)
      }
    }

    // Get the next order_index
    const maxOrder = await sql`
      SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
      FROM idea_facets
      WHERE idea_id = ${id}
    `
    const nextOrder = maxOrder[0]?.next_order || 0

    // Create facet with default data if not provided
    const facetData = data || getDefaultFacetData(facetType)

    const result = await sql`
      INSERT INTO idea_facets (
        idea_id,
        branch_id,
        facet_type,
        name,
        data,
        position_x,
        position_y,
        order_index,
        metadata
      ) VALUES (
        ${id},
        ${branchId || null},
        ${facetType},
        ${name || null},
        ${JSON.stringify(facetData)},
        ${positionX || 0},
        ${positionY || 0},
        ${nextOrder},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    const facet = result[0]

    // Also create a canvas node for this facet
    await sql`
      INSERT INTO idea_canvas_nodes (
        idea_id,
        branch_id,
        node_type,
        reference_id,
        reference_type,
        position_x,
        position_y,
        layer
      ) VALUES (
        ${id},
        ${branchId || null},
        'facet',
        ${facet.id},
        'idea_facets',
        ${positionX || 0},
        ${positionY || 0},
        'core'
      )
    `

    return successResponse(transformFacet(facet), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/ideas/[id]/facets error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create facet',
      500,
      error.message
    )
  }
}
