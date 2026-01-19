import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

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
    updatedAt: row.updated_at
  }
}

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

function transformAttempt(row: any) {
  return {
    id: row.id,
    episodeId: row.episode_id,
    problem: row.problem,
    approachTried: row.approach_tried,
    failureMode: row.failure_mode,
    rootCause: row.root_cause,
    lessonLearned: row.lesson_learned,
    preventionStrategy: row.prevention_strategy,
    createdAt: row.created_at
  }
}

function transformComparison(row: any) {
  return {
    id: row.id,
    episodeId: row.episode_id,
    solutionA: row.solution_a,
    solutionB: row.solution_b,
    criteria: row.criteria || [],
    winner: row.winner,
    winnerRationale: row.winner_rationale,
    createdAt: row.created_at
  }
}

/**
 * GET /api/memory/why/[id]
 * Get a specific decision with all related data
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
    const { id } = await params

    // Get the decision
    const decisions = await sql`
      SELECT * FROM mlp_why_decisions
      WHERE id = ${id} AND user_id = ${userId}
    `

    if (decisions.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Decision not found', 404)
    }

    // Get related nodes, attempts, and comparisons
    const nodes = await sql`
      SELECT * FROM mlp_why_nodes
      WHERE episode_id = ${id}
      ORDER BY order_index ASC, created_at ASC
    `

    const attempts = await sql`
      SELECT * FROM mlp_why_attempts
      WHERE episode_id = ${id}
      ORDER BY created_at DESC
    `

    const comparisons = await sql`
      SELECT * FROM mlp_why_comparisons
      WHERE episode_id = ${id}
      ORDER BY created_at DESC
    `

    const decision = transformDecision(decisions[0])

    return successResponse({
      ...decision,
      nodes: nodes.map(transformNode),
      attempts: attempts.map(transformAttempt),
      comparisons: comparisons.map(transformComparison)
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/why/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get decision',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/memory/why/[id]
 * Update a decision
 *
 * Body: {
 *   title?: string
 *   status?: "active" | "resolved" | "revisit" | "deprecated"
 *   summary?: string
 *   tags?: string[]
 *   domains?: string[]
 *   stakeholders?: string[]
 *   businessDrivers?: string[]
 *   technicalConstraints?: string[]
 *   futureConsiderations?: string[]
 *   compressionLevel?: number (1-5)
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    const body = await request.json()

    // Verify ownership
    const existing = await sql`
      SELECT id FROM mlp_why_decisions
      WHERE id = ${id} AND user_id = ${userId}
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Decision not found', 404)
    }

    const {
      title,
      status,
      summary,
      tags,
      domains,
      stakeholders,
      businessDrivers,
      technicalConstraints,
      futureConsiderations,
      compressionLevel
    } = body

    // Validate status if provided
    const validStatuses = ['active', 'resolved', 'revisit', 'deprecated']
    if (status && !validStatuses.includes(status)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400)
    }

    // Validate compression level if provided
    if (compressionLevel !== undefined && (compressionLevel < 1 || compressionLevel > 5)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Compression level must be between 1 and 5', 400)
    }

    // Update the decision
    const result = await sql`
      UPDATE mlp_why_decisions
      SET
        title = COALESCE(${title?.trim() || null}, title),
        status = COALESCE(${status || null}, status),
        summary = COALESCE(${summary?.trim()}, summary),
        tags = COALESCE(${tags || null}, tags),
        domains = COALESCE(${domains || null}, domains),
        stakeholders = COALESCE(${stakeholders || null}, stakeholders),
        business_drivers = COALESCE(${businessDrivers || null}, business_drivers),
        technical_constraints = COALESCE(${technicalConstraints || null}, technical_constraints),
        future_considerations = COALESCE(${futureConsiderations || null}, future_considerations),
        compression_level = COALESCE(${compressionLevel || null}, compression_level),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    return successResponse(transformDecision(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/memory/why/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update decision',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/memory/why/[id]
 * Delete a decision and all related data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    // Verify ownership and delete (cascades to nodes, attempts, comparisons)
    const result = await sql`
      DELETE FROM mlp_why_decisions
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Decision not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/memory/why/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete decision',
      500,
      error.message
    )
  }
}
