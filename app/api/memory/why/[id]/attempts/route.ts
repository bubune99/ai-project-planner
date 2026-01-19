import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
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
 * GET /api/memory/why/[id]/attempts
 * List all attempted solutions for a decision
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

    const attempts = await sql`
      SELECT * FROM mlp_why_attempts
      WHERE episode_id = ${decisionId}
      ORDER BY created_at DESC
    `

    return successResponse(attempts.map(transformAttempt), {
      total: attempts.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/why/[id]/attempts error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get attempted solutions',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/why/[id]/attempts
 * Record a failed attempt and lessons learned
 *
 * Body: {
 *   problem: string (required) - The problem being solved
 *   approachTried: string (required) - What was attempted
 *   failureMode: string (required) - How it failed
 *   rootCause?: string - Why it failed
 *   lessonLearned: string (required) - What was learned
 *   preventionStrategy?: string - How to prevent in future
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
      problem,
      approachTried,
      failureMode,
      rootCause,
      lessonLearned,
      preventionStrategy
    } = body

    // Validate required fields
    if (!problem?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Problem description is required', 400)
    }
    if (!approachTried?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Approach tried is required', 400)
    }
    if (!failureMode?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Failure mode is required', 400)
    }
    if (!lessonLearned?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Lesson learned is required', 400)
    }

    const result = await sql`
      INSERT INTO mlp_why_attempts (
        episode_id,
        problem,
        approach_tried,
        failure_mode,
        root_cause,
        lesson_learned,
        prevention_strategy
      ) VALUES (
        ${decisionId},
        ${problem.trim()},
        ${approachTried.trim()},
        ${failureMode.trim()},
        ${rootCause?.trim() || null},
        ${lessonLearned.trim()},
        ${preventionStrategy?.trim() || null}
      )
      RETURNING *
    `

    return successResponse(transformAttempt(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/why/[id]/attempts error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to record attempt',
      500,
      error.message
    )
  }
}
