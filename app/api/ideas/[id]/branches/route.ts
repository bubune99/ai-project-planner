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
    // Additional computed fields
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
 * GET /api/ideas/[id]/branches
 * List all branches for an idea
 *
 * Query params:
 * - activeOnly: "true" (filter to active branches only)
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
    const activeOnly = searchParams.get('activeOnly') === 'true'

    const branches = await sql`
      SELECT
        b.*,
        pb.name as parent_branch_name,
        u.display_name as creator_name
      FROM idea_branches b
      LEFT JOIN idea_branches pb ON b.parent_branch_id = pb.id
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.idea_id = ${id}
        ${activeOnly ? sql`AND b.is_active = true` : sql``}
      ORDER BY b.is_main DESC, b.created_at ASC
    `

    const transformedBranches = branches.map(transformBranch)

    return successResponse(transformedBranches, {
      total: transformedBranches.length,
      activeBranch: transformedBranches.find(b => b.isActive)?.id || null,
      mainBranch: transformedBranches.find(b => b.isMain)?.id || null
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/branches error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get branches',
      500,
      error.message
    )
  }
}

/**
 * POST /api/ideas/[id]/branches
 * Create a new branch for an idea
 *
 * Body: { name, parentBranchId?, snapshot? }
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
    const { name, parentBranchId, snapshot } = body

    // Validate name
    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Branch name is required', 400)
    }

    // Check if branch name already exists for this idea
    const existingBranch = await sql`
      SELECT id FROM idea_branches
      WHERE idea_id = ${id} AND name = ${name.trim()}
    `
    if (existingBranch.length > 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Branch name already exists', 400)
    }

    // If parentBranchId provided, verify it belongs to this idea
    if (parentBranchId) {
      const parentCheck = await sql`
        SELECT id FROM idea_branches
        WHERE id = ${parentBranchId} AND idea_id = ${id}
      `
      if (parentCheck.length === 0) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid parent branch ID', 400)
      }
    }

    // If no snapshot provided and parent exists, capture current state as snapshot
    let branchSnapshot = snapshot || {}
    if (!snapshot && parentBranchId) {
      // Get current facets and nodes from parent branch
      const parentFacets = await sql`
        SELECT id, facet_type, name, data, position_x, position_y, order_index
        FROM idea_facets
        WHERE idea_id = ${id} AND (branch_id = ${parentBranchId} OR branch_id IS NULL)
      `
      const parentNodes = await sql`
        SELECT id, node_type, reference_id, position_x, position_y, style, content
        FROM idea_canvas_nodes
        WHERE idea_id = ${id} AND (branch_id = ${parentBranchId} OR branch_id IS NULL)
      `
      const parentEdges = await sql`
        SELECT source_node_id, target_node_id, edge_type, label, style
        FROM idea_canvas_edges
        WHERE idea_id = ${id} AND (branch_id = ${parentBranchId} OR branch_id IS NULL)
      `
      branchSnapshot = {
        facets: parentFacets,
        nodes: parentNodes,
        edges: parentEdges,
        capturedAt: new Date().toISOString()
      }
    }

    // Create the branch (not active by default)
    const result = await sql`
      INSERT INTO idea_branches (
        idea_id,
        name,
        parent_branch_id,
        is_active,
        is_main,
        snapshot,
        created_by
      ) VALUES (
        ${id},
        ${name.trim()},
        ${parentBranchId || null},
        false,
        false,
        ${JSON.stringify(branchSnapshot)},
        ${userId}
      )
      RETURNING *
    `

    const branch = result[0]

    // Get parent branch name for response
    let parentBranchName = null
    if (branch.parent_branch_id) {
      const parent = await sql`
        SELECT name FROM idea_branches WHERE id = ${branch.parent_branch_id}
      `
      parentBranchName = parent[0]?.name
    }

    return successResponse(transformBranch({
      ...branch,
      parent_branch_name: parentBranchName
    }), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/ideas/[id]/branches error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create branch',
      500,
      error.message
    )
  }
}
