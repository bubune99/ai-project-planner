import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"
import { isUuid } from "@/lib/api/ids"

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/phases
 * Get all phases for a project
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = await Promise.resolve(params)
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401)
    }
    if (!isUuid(id)) return errorResponse(ErrorCodes.NOT_FOUND, 'Project not found', 404)
    if (!(await verifyProjectOwnership(id, authContext.userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Project not found', 404)
    }

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
      500
    )
  }
}

/**
 * POST /api/projects/[id]/phases
 * Transition to a new phase
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = await Promise.resolve(params)
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401)
    }
    if (!isUuid(id)) return errorResponse(ErrorCodes.NOT_FOUND, 'Project not found', 404)
    if (!(await verifyProjectOwnership(id, authContext.userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Project not found', 404)
    }
    if (!(await verifyCollaboratorAccess(id, authContext.userId, "editor"))) {
      return errorResponse(ErrorCodes.FORBIDDEN, 'Editor access required', 403)
    }

    const body = await request.json()
    const { newPhase, description } = body
    // Who completed the phase is the signed-in caller, never a name sent in the body (review 2026-10-08, card
    // d81ee324: completedBy was trusted as sent). The field is still accepted from old clients and ignored.
    const completedBy = authContext.userId

    if (!newPhase) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'newPhase is required',
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
      500
    )
  }
}
