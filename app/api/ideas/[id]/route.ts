import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { IdeaLifecycle } from '@/lib/db/schema'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

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
    documentation_5wh: row.documentation_5wh || {},
    // Additional joined data
    projectName: row.project_name,
    facetCount: parseInt(row.facet_count || '0'),
    branchCount: parseInt(row.branch_count || '0'),
    validationCount: parseInt(row.validation_count || '0'),
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
 * GET /api/ideas/[id]
 * Get a single idea with all details
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

    // Get the idea with all related counts
    const result = await sql`
      SELECT
        i.*,
        p.name as project_name,
        (SELECT COUNT(*) FROM idea_facets f WHERE f.idea_id = i.id) as facet_count,
        (SELECT COUNT(*) FROM idea_branches b WHERE b.idea_id = i.id) as branch_count,
        (SELECT COUNT(*) FROM idea_validations v WHERE v.idea_id = i.id) as validation_count
      FROM ideas i
      LEFT JOIN projects p ON i.promoted_to_project_id = p.id
      WHERE i.id = ${id}
        AND i.user_id = ${userId}
        AND i.deleted_at IS NULL
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const idea = result[0]

    // Get active branch
    const activeBranch = await sql`
      SELECT id, name FROM idea_branches
      WHERE idea_id = ${id} AND is_active = true
      LIMIT 1
    `

    // Get perspectives
    const perspectives = await sql`
      SELECT id, name, description, owner, is_default
      FROM idea_perspectives
      WHERE idea_id = ${id}
      ORDER BY is_default DESC, created_at ASC
    `

    // Get facets for active branch (or main branch)
    const branchId = activeBranch[0]?.id
    const facets = await sql`
      SELECT id, facet_type, name, data, position_x, position_y, order_index
      FROM idea_facets
      WHERE idea_id = ${id}
        ${branchId ? sql`AND (branch_id = ${branchId} OR branch_id IS NULL)` : sql`AND branch_id IS NULL`}
      ORDER BY order_index ASC
    `

    // Get canvas nodes for active branch
    const canvasNodes = await sql`
      SELECT id, node_type, reference_id, reference_type, position_x, position_y, width, height, style, content, layer
      FROM idea_canvas_nodes
      WHERE idea_id = ${id}
        ${branchId ? sql`AND (branch_id = ${branchId} OR branch_id IS NULL)` : sql`AND branch_id IS NULL`}
    `

    // Get canvas edges
    const canvasEdges = await sql`
      SELECT id, source_node_id, target_node_id, edge_type, label, style
      FROM idea_canvas_edges
      WHERE idea_id = ${id}
        ${branchId ? sql`AND (branch_id = ${branchId} OR branch_id IS NULL)` : sql`AND branch_id IS NULL`}
    `

    // Get latest validation
    const latestValidation = await sql`
      SELECT id, agent_type, status, validation_score, blockers, recommendations, created_at
      FROM idea_validations
      WHERE idea_id = ${id}
      ORDER BY created_at DESC
      LIMIT 1
    `

    return successResponse({
      ...transformIdea(idea),
      activeBranch: activeBranch[0] || null,
      perspectives: perspectives.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        owner: p.owner,
        isDefault: p.is_default
      })),
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
        nodes: canvasNodes.map(n => ({
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
        edges: canvasEdges.map(e => ({
          id: e.id,
          sourceNodeId: e.source_node_id,
          targetNodeId: e.target_node_id,
          edgeType: e.edge_type,
          label: e.label,
          style: e.style
        }))
      },
      latestValidation: latestValidation[0] ? {
        id: latestValidation[0].id,
        agentType: latestValidation[0].agent_type,
        status: latestValidation[0].status,
        validationScore: latestValidation[0].validation_score,
        blockers: latestValidation[0].blockers,
        recommendations: latestValidation[0].recommendations,
        createdAt: latestValidation[0].created_at
      } : null
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get idea',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/ideas/[id]
 * Update an idea
 *
 * Body: { title?, description?, category?, tags?, lifecycle?, visibility?, canvasSettings?, metadata? }
 */
export async function PATCH(
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
    const { title, description, category, tags, lifecycle, visibility, canvasSettings, metadata } = body

    // Fetch existing envelope + project context for merge
    const existingRow = await sql`SELECT documentation_5wh, promoted_to_project_id FROM ideas WHERE id = ${id} AND user_id = ${userId}`
    const mergeResult = mergeEnvelopeForPatch(
      existingRow[0]?.documentation_5wh,
      body,
      { userId, projectId: existingRow[0]?.promoted_to_project_id ?? undefined, agentId: undefined },
      {
        type: 'idea',
        title: title || undefined,
        summary: description || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/ideas/[id]',
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`)
      values.push(title.trim())
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description?.trim() || null)
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`)
      values.push(category?.trim() || null)
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`)
      values.push(tags)
    }
    if (lifecycle !== undefined) {
      // Validate lifecycle transition
      const validLifecycles = ['seed', 'exploring', 'refined', 'promoted', 'archived']
      if (!validLifecycles.includes(lifecycle)) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid lifecycle state', 400)
      }
      updates.push(`lifecycle = $${paramIndex++}`)
      values.push(lifecycle)
    }
    if (visibility !== undefined) {
      const validVisibilities = ['private', 'shared', 'public']
      if (!validVisibilities.includes(visibility)) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid visibility', 400)
      }
      updates.push(`visibility = $${paramIndex++}`)
      values.push(visibility)
    }
    if (canvasSettings !== undefined) {
      updates.push(`canvas_settings = $${paramIndex++}`)
      values.push(JSON.stringify(canvasSettings))
    }
    if (metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`)
      values.push(JSON.stringify(metadata))
    }

    if (updates.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'No fields to update', 400)
    }

    // Execute update — always write the merged envelope alongside field changes.
    // Build ONE parameterized statement and run it via sql.query(text, params) so
    // every $N binds to `values`. The previous tagged-template form injected the
    // SET clause via sql.unsafe() (raw text) while ALSO interpolating the envelope,
    // which made the tagged template auto-assign $1 to the envelope — colliding with
    // the `$1` in the injected `column = $1` text → Postgres "inconsistent types
    // deduced for parameter $1", and `values` was never bound at all.
    const envParam = paramIndex++
    const idParam = paramIndex++
    const userParam = paramIndex++
    values.push(envelopeForSql(mergeResult.envelope), id, userId)

    const queryText =
      `UPDATE ideas SET ${updates.join(', ')}, ` +
      `documentation_5wh = $${envParam}::jsonb, updated_at = NOW() ` +
      `WHERE id = $${idParam} AND user_id = $${userParam} ` +
      `RETURNING *`

    const result = await sql.query(queryText, values)

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    return successResponse(transformIdea(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/ideas/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update idea',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/ideas/[id]
 * Soft delete an idea
 */
export async function DELETE(
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

    // Soft delete the idea
    await sql`
      UPDATE ideas
      SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `

    return successResponse({ message: 'Idea deleted successfully' })
  } catch (error: any) {
    console.error('[API] DELETE /api/ideas/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete idea',
      500,
      error.message
    )
  }
}
