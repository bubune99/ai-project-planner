import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'

/**
 * GET /api/projects/[id]/phases
 * Get all phases for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params)
    const phases = await sql`
      SELECT *
      FROM project_phases
      WHERE project_id = ${id}
      ORDER BY started_at ASC
    `

    return successResponse(phases, {
      total: phases.length
    })
  } catch (error: any) {
    console.error('[GET /api/projects/[id]/phases] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get project phases',
      500,
      error.message
    )
  }
}

/**
 * POST /api/projects/[id]/phases
 * Transition to a new phase
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params)
    const body = await request.json()
    const { newPhase, completedBy, description } = body

    if (!newPhase || !completedBy) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'newPhase and completedBy are required',
        400
      )
    }

    // Use the database function to handle the transition logic safely
    const result = await sql`
      SELECT * FROM transition_to_phase(
        ${id},
        ${newPhase},
        ${completedBy},
        ${description || null}
      )
    `

    if (result.length === 0) {
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Phase transition failed with no result',
        500
      )
    }

    const transitionResult = result[0]

    if (!transitionResult.success) {
      return errorResponse(
        ErrorCodes.BAD_REQUEST,
        transitionResult.message || 'Phase transition failed',
        400
      )
    }

    return successResponse(transitionResult, undefined, 201)
  } catch (error: any) {
    console.error('[POST /api/projects/[id]/phases] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to transition phase',
      500,
      error.message
    )
  }
}
