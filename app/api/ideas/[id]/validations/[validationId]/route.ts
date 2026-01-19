import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { ValidationAgentType, ValidationStatus } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend IdeaValidation format
 */
function transformValidation(row: any) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    agentType: row.agent_type as ValidationAgentType,
    status: row.status as ValidationStatus,
    messages: row.messages || [],
    currentFacetId: row.current_facet_id,
    validatedFacetIds: row.validated_facet_ids || [],
    validationScore: row.validation_score,
    blockers: row.blockers || [],
    recommendations: row.recommendations || [],
    agentConfig: row.agent_config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
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
 * GET /api/ideas/[id]/validations/[validationId]
 * Get a single validation session with full conversation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; validationId: string }> }
) {
  try {
    const { id, validationId } = await params

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
      SELECT v.*, f.name as current_facet_name, f.facet_type as current_facet_type
      FROM idea_validations v
      LEFT JOIN idea_facets f ON v.current_facet_id = f.id
      WHERE v.id = ${validationId} AND v.idea_id = ${id}
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Validation not found', 404)
    }

    // Get validated facet details
    const validation = result[0]
    let validatedFacets: any[] = []
    if (validation.validated_facet_ids?.length > 0) {
      validatedFacets = await sql`
        SELECT id, facet_type, name FROM idea_facets
        WHERE id = ANY(${validation.validated_facet_ids})
      `
    }

    return successResponse({
      ...transformValidation(validation),
      currentFacetName: validation.current_facet_name,
      currentFacetType: validation.current_facet_type,
      validatedFacets: validatedFacets.map(f => ({
        id: f.id,
        facetType: f.facet_type,
        name: f.name
      }))
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/validations/[validationId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get validation',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/ideas/[id]/validations/[validationId]
 * Update a validation session (add message, update status, set score)
 *
 * Body: {
 *   message?: { role: "user" | "assistant", content: string },
 *   status?: "active" | "completed" | "paused" | "cancelled",
 *   currentFacetId?: string,
 *   validatedFacetIds?: string[],
 *   validationScore?: number,
 *   blockers?: string[],
 *   recommendations?: string[]
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; validationId: string }> }
) {
  try {
    const { id, validationId } = await params

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

    // Get existing validation
    const existing = await sql`
      SELECT * FROM idea_validations
      WHERE id = ${validationId} AND idea_id = ${id}
    `
    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Validation not found', 404)
    }

    const validation = existing[0]
    const body = await request.json()
    const { message, status, currentFacetId, validatedFacetIds, validationScore, blockers, recommendations } = body

    // Build update
    const updates: string[] = []

    // Add new message if provided
    if (message) {
      const existingMessages = validation.messages || []
      const newMessage = {
        ...message,
        timestamp: new Date().toISOString()
      }
      const updatedMessages = [...existingMessages, newMessage]
      updates.push(`messages = '${JSON.stringify(updatedMessages)}'::jsonb`)
    }

    // Update status
    if (status !== undefined) {
      const validStatuses: ValidationStatus[] = ['active', 'completed', 'paused', 'cancelled']
      if (!validStatuses.includes(status)) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid status', 400)
      }
      updates.push(`status = '${status}'`)

      // Set completed_at if completing
      if (status === 'completed') {
        updates.push(`completed_at = NOW()`)
      }
    }

    // Update current facet being validated
    if (currentFacetId !== undefined) {
      if (currentFacetId === null) {
        updates.push(`current_facet_id = NULL`)
      } else {
        // Verify facet belongs to this idea
        const facetCheck = await sql`
          SELECT id FROM idea_facets WHERE id = ${currentFacetId} AND idea_id = ${id}
        `
        if (facetCheck.length === 0) {
          return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid facet ID', 400)
        }
        updates.push(`current_facet_id = '${currentFacetId}'`)
      }
    }

    // Update validated facet IDs
    if (validatedFacetIds !== undefined) {
      updates.push(`validated_facet_ids = ARRAY[${validatedFacetIds.map((id: string) => `'${id}'::uuid`).join(', ')}]`)
    }

    // Update validation score
    if (validationScore !== undefined) {
      if (validationScore < 0 || validationScore > 100) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation score must be between 0 and 100', 400)
      }
      updates.push(`validation_score = ${validationScore}`)
    }

    // Update blockers
    if (blockers !== undefined) {
      updates.push(`blockers = ARRAY[${blockers.map((b: string) => `'${b.replace(/'/g, "''")}'`).join(', ')}]`)
    }

    // Update recommendations
    if (recommendations !== undefined) {
      updates.push(`recommendations = ARRAY[${recommendations.map((r: string) => `'${r.replace(/'/g, "''")}'`).join(', ')}]`)
    }

    if (updates.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'No fields to update', 400)
    }

    const result = await sql`
      UPDATE idea_validations
      SET ${sql.unsafe(updates.join(', '))}, updated_at = NOW()
      WHERE id = ${validationId} AND idea_id = ${id}
      RETURNING *
    `

    return successResponse(transformValidation(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/ideas/[id]/validations/[validationId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update validation',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/ideas/[id]/validations/[validationId]
 * Delete a validation session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; validationId: string }> }
) {
  try {
    const { id, validationId } = await params

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
      DELETE FROM idea_validations
      WHERE id = ${validationId} AND idea_id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Validation not found', 404)
    }

    return successResponse({ message: 'Validation deleted successfully' })
  } catch (error: any) {
    console.error('[API] DELETE /api/ideas/[id]/validations/[validationId] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete validation',
      500,
      error.message
    )
  }
}
