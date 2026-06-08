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
 * GET /api/ideas/[id]/facets/[facetId]
 * Get a single facet
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; facetId: string }> }
) {
  try {
    const { id, facetId } = await params

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

    const result = await sql`
      SELECT f.*, b.name as branch_name
      FROM idea_facets f
      LEFT JOIN idea_branches b ON f.branch_id = b.id
      WHERE f.id = ${facetId} AND f.idea_id = ${id}
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Facet not found', 404)
    }

    return successResponse({
      ...transformFacet(result[0]),
      branchName: result[0].branch_name
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/facets/[facetId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get facet',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/ideas/[id]/facets/[facetId]
 * Update a facet
 *
 * Body: { name?, data?, positionX?, positionY?, orderIndex?, metadata? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; facetId: string }> }
) {
  try {
    const { id, facetId } = await params

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
    const { name, data, positionX, positionY, orderIndex, metadata } = body

    // Build update — parameterized ($N + values) to avoid SQL injection and
    // apostrophe-breakage from inlining user input into the SQL text.
    const updates: string[] = []
    const values: unknown[] = []
    let p = 1

    if (name !== undefined) {
      updates.push(`name = $${p++}`)
      values.push(name)
    }
    if (data !== undefined) {
      updates.push(`data = $${p++}::jsonb`)
      values.push(JSON.stringify(data))
    }
    if (positionX !== undefined) {
      updates.push(`position_x = $${p++}`)
      values.push(positionX)
    }
    if (positionY !== undefined) {
      updates.push(`position_y = $${p++}`)
      values.push(positionY)
    }
    if (orderIndex !== undefined) {
      updates.push(`order_index = $${p++}`)
      values.push(orderIndex)
    }
    if (metadata !== undefined) {
      updates.push(`metadata = $${p++}::jsonb`)
      values.push(JSON.stringify(metadata))
    }

    if (updates.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'No fields to update', 400)
    }

    const facetParam = p++
    const ideaParam = p++
    values.push(facetId, id)
    const result = await sql.query(
      `UPDATE idea_facets SET ${updates.join(', ')}, updated_at = NOW() ` +
      `WHERE id = $${facetParam} AND idea_id = $${ideaParam} RETURNING *`,
      values
    )

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Facet not found', 404)
    }

    // Also update the corresponding canvas node position if position changed
    if (positionX !== undefined || positionY !== undefined) {
      await sql`
        UPDATE idea_canvas_nodes
        SET
          ${positionX !== undefined ? sql`position_x = ${positionX},` : sql``}
          ${positionY !== undefined ? sql`position_y = ${positionY},` : sql``}
          updated_at = NOW()
        WHERE reference_id = ${facetId} AND reference_type = 'idea_facets'
      `
    }

    return successResponse(transformFacet(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/ideas/[id]/facets/[facetId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update facet',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/ideas/[id]/facets/[facetId]
 * Delete a facet
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; facetId: string }> }
) {
  try {
    const { id, facetId } = await params

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

    // Delete the canvas node first (FK constraint)
    await sql`
      DELETE FROM idea_canvas_nodes
      WHERE reference_id = ${facetId} AND reference_type = 'idea_facets'
    `

    // Delete any edges connected to this facet's node
    await sql`
      DELETE FROM idea_canvas_edges
      WHERE source_node_id IN (
        SELECT id FROM idea_canvas_nodes WHERE reference_id = ${facetId}
      ) OR target_node_id IN (
        SELECT id FROM idea_canvas_nodes WHERE reference_id = ${facetId}
      )
    `

    // Delete the facet
    const result = await sql`
      DELETE FROM idea_facets
      WHERE id = ${facetId} AND idea_id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Facet not found', 404)
    }

    return successResponse({ message: 'Facet deleted successfully' })
  } catch (error: any) {
    console.error('[API] DELETE /api/ideas/[id]/facets/[facetId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete facet',
      500,
      error.message
    )
  }
}
