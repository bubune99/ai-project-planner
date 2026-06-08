import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend IdeaBranch format
 */
function transformBranch(row: any) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    name: row.name,
    parentBranchId: row.parent_branch_id,
    isActive: row.is_active,
    isMain: row.is_main,
    snapshot: row.snapshot || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergedAt: row.merged_at,
    mergedIntoBranchId: row.merged_into_branch_id,
    parentBranchName: row.parent_branch_name,
    creatorName: row.creator_name
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
 * GET /api/ideas/[id]/branches/[branchId]
 * Get a single branch with its content
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params

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
      SELECT
        b.*,
        pb.name as parent_branch_name,
        u.name as creator_name
      FROM idea_branches b
      LEFT JOIN idea_branches pb ON b.parent_branch_id = pb.id
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ${branchId} AND b.idea_id = ${id}
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Branch not found', 404)
    }

    const branch = result[0]

    // Get facets for this branch
    const facets = await sql`
      SELECT id, facet_type, name, data, position_x, position_y, order_index
      FROM idea_facets
      WHERE idea_id = ${id} AND (branch_id = ${branchId} OR branch_id IS NULL)
      ORDER BY order_index ASC
    `

    // Get canvas nodes for this branch
    const nodes = await sql`
      SELECT id, node_type, reference_id, reference_type, position_x, position_y, width, height, style, content, layer
      FROM idea_canvas_nodes
      WHERE idea_id = ${id} AND (branch_id = ${branchId} OR branch_id IS NULL)
    `

    // Get canvas edges for this branch
    const edges = await sql`
      SELECT id, source_node_id, target_node_id, edge_type, label, style
      FROM idea_canvas_edges
      WHERE idea_id = ${id} AND (branch_id = ${branchId} OR branch_id IS NULL)
    `

    return successResponse({
      ...transformBranch(branch),
      facets: facets.map(f => ({
        id: f.id,
        facetType: f.facet_type,
        name: f.name,
        data: f.data,
        positionX: f.position_x,
        positionY: f.position_y,
        orderIndex: f.order_index
      })),
      canvas: {
        nodes: nodes.map(n => ({
          id: n.id,
          nodeType: n.node_type,
          referenceId: n.reference_id,
          referenceType: n.reference_type,
          positionX: n.position_x,
          positionY: n.position_y,
          width: n.width,
          height: n.height,
          style: n.style,
          content: n.content,
          layer: n.layer
        })),
        edges: edges.map(e => ({
          id: e.id,
          sourceNodeId: e.source_node_id,
          targetNodeId: e.target_node_id,
          edgeType: e.edge_type,
          label: e.label,
          style: e.style
        }))
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/branches/[branchId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get branch',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/ideas/[id]/branches/[branchId]
 * Update a branch (name, activate, etc.)
 *
 * Body: { name?, isActive?, snapshot? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params

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
    const { name, isActive, snapshot } = body

    // Check if branch exists
    const existing = await sql`
      SELECT id, is_main FROM idea_branches
      WHERE id = ${branchId} AND idea_id = ${id}
    `
    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Branch not found', 404)
    }

    // Build update — parameterized ($N + values) to avoid SQL injection and
    // apostrophe-breakage from inlining user input into the SQL text.
    const updates: string[] = []
    const values: unknown[] = []
    let p = 1

    if (name !== undefined) {
      // Check if new name already exists (exclude current branch)
      const nameCheck = await sql`
        SELECT id FROM idea_branches
        WHERE idea_id = ${id} AND name = ${name.trim()} AND id != ${branchId}
      `
      if (nameCheck.length > 0) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Branch name already exists', 400)
      }
      updates.push(`name = $${p++}`)
      values.push(name.trim())
    }

    if (isActive !== undefined) {
      // If setting this branch as active, deactivate all others first
      if (isActive === true) {
        await sql`
          UPDATE idea_branches
          SET is_active = false
          WHERE idea_id = ${id} AND id != ${branchId}
        `
      }
      updates.push(`is_active = $${p++}`)
      values.push(isActive)
    }

    if (snapshot !== undefined) {
      updates.push(`snapshot = $${p++}::jsonb`)
      values.push(JSON.stringify(snapshot))
    }

    if (updates.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'No fields to update', 400)
    }

    const branchParam = p++
    const ideaParam = p++
    values.push(branchId, id)
    const result = await sql.query(
      `UPDATE idea_branches SET ${updates.join(', ')}, updated_at = NOW() ` +
      `WHERE id = $${branchParam} AND idea_id = $${ideaParam} RETURNING *`,
      values
    )

    return successResponse(transformBranch(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/ideas/[id]/branches/[branchId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update branch',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/ideas/[id]/branches/[branchId]
 * Delete a branch (cannot delete main branch)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  try {
    const { id, branchId } = await params

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

    // Check if branch exists and is not main
    const branch = await sql`
      SELECT id, is_main FROM idea_branches
      WHERE id = ${branchId} AND idea_id = ${id}
    `
    if (branch.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Branch not found', 404)
    }
    if (branch[0].is_main) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Cannot delete main branch', 400)
    }

    // Delete facets associated with this branch only
    await sql`
      DELETE FROM idea_facets
      WHERE branch_id = ${branchId}
    `

    // Delete canvas nodes associated with this branch only
    await sql`
      DELETE FROM idea_canvas_nodes
      WHERE branch_id = ${branchId}
    `

    // Delete canvas edges associated with this branch only
    await sql`
      DELETE FROM idea_canvas_edges
      WHERE branch_id = ${branchId}
    `

    // Delete child branches (recursively would be better, but for now just immediate children)
    await sql`
      UPDATE idea_branches
      SET parent_branch_id = NULL
      WHERE parent_branch_id = ${branchId}
    `

    // Delete the branch
    await sql`
      DELETE FROM idea_branches
      WHERE id = ${branchId} AND idea_id = ${id}
    `

    return successResponse({ message: 'Branch deleted successfully' })
  } catch (error: any) {
    console.error('[API] DELETE /api/ideas/[id]/branches/[branchId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete branch',
      500,
      error.message
    )
  }
}
