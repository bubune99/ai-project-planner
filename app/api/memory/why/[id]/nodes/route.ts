import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformNode(row: any) {
  return {
    id: row.id,
    episodeId: row.episode_id,
    parentNodeId: row.parent_node_id,
    reasoning: row.reasoning,
    alternatives: row.alternatives || [],
    constraints: row.constraints || [],
    confidenceLevel: row.confidence_level,
    revisitTriggers: row.revisit_triggers || [],
    impactAssessment: row.impact_assessment || {},
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Verify user owns the parent decision
 */
async function verifyDecisionOwnership(decisionId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT id FROM mlp_why_decisions
    WHERE id = ${decisionId} AND user_id = ${userId}
  `
  return result.length > 0
}

/**
 * GET /api/memory/why/[id]/nodes
 * List all nodes for a decision episode
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id: decisionId } = await params

    // Verify ownership
    const hasAccess = await verifyDecisionOwnership(decisionId, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Decision not found', 404)
    }

    const nodes = await sql`
      SELECT * FROM mlp_why_nodes
      WHERE episode_id = ${decisionId}
      ORDER BY order_index ASC, created_at ASC
    `

    return successResponse(nodes.map(transformNode), {
      total: nodes.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/why/[id]/nodes error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get decision nodes',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/why/[id]/nodes
 * Add a reasoning node to a decision
 *
 * Body: {
 *   reasoning: string (required)
 *   parentNodeId?: UUID (for tree structure)
 *   alternatives?: Array<{name: string, pros: string[], cons: string[]}>
 *   constraints?: string[]
 *   confidenceLevel?: number (0-100)
 *   revisitTriggers?: string[]
 *   impactAssessment?: object
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id: decisionId } = await params
    const body = await request.json()

    // Verify ownership
    const hasAccess = await verifyDecisionOwnership(decisionId, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Decision not found', 404)
    }

    const {
      reasoning,
      parentNodeId,
      alternatives,
      constraints,
      confidenceLevel,
      revisitTriggers,
      impactAssessment
    } = body

    // Validate required fields
    if (!reasoning?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Reasoning is required', 400)
    }

    // Validate confidence level if provided
    if (confidenceLevel !== undefined && (confidenceLevel < 0 || confidenceLevel > 100)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Confidence level must be between 0 and 100', 400)
    }

    // Get next order index
    const maxOrder = await sql`
      SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
      FROM mlp_why_nodes
      WHERE episode_id = ${decisionId}
        ${parentNodeId ? sql`AND parent_node_id = ${parentNodeId}` : sql`AND parent_node_id IS NULL`}
    `

    const result = await sql`
      INSERT INTO mlp_why_nodes (
        episode_id,
        parent_node_id,
        reasoning,
        alternatives,
        constraints,
        confidence_level,
        revisit_triggers,
        impact_assessment,
        order_index
      ) VALUES (
        ${decisionId},
        ${parentNodeId || null},
        ${reasoning.trim()},
        ${alternatives ? JSON.stringify(alternatives) : '[]'},
        ${constraints || []},
        ${confidenceLevel || null},
        ${revisitTriggers || []},
        ${impactAssessment ? JSON.stringify(impactAssessment) : '{}'},
        ${maxOrder[0]?.next_order || 0}
      )
      RETURNING *
    `

    return successResponse(transformNode(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/why/[id]/nodes error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create decision node',
      500,
      error.message
    )
  }
}
