import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/todos/reorder
 * Update order of multiple todos
 *
 * Body: { todoIds: string[] } - Array of todo IDs in new order
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { todoIds } = body

    // Validate input
    if (!Array.isArray(todoIds) || todoIds.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'todoIds array is required', 400)
    }

    // Verify all todos belong to the user
    const ownership = await sql`
      SELECT id FROM todos
      WHERE id = ANY(${todoIds})
        AND user_id = ${userId}
        AND deleted_at IS NULL
    `

    if (ownership.length !== todoIds.length) {
      return errorResponse(
        ErrorCodes.FORBIDDEN,
        'Some todos do not exist or you do not have access to them',
        403
      )
    }

    // Update order_index for each todo
    // Use a transaction-like approach with a single query using CASE
    const updates = todoIds.map((id, index) => ({ id, order: index }))

    // Build a VALUES clause for the update
    for (let i = 0; i < updates.length; i++) {
      await sql`
        UPDATE todos
        SET order_index = ${updates[i].order}, updated_at = NOW()
        WHERE id = ${updates[i].id} AND user_id = ${userId}
      `
    }

    return successResponse({
      reordered: true,
      count: todoIds.length
    })
  } catch (error: any) {
    console.error('[API] POST /api/todos/reorder error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to reorder todos',
      500,
      error.message
    )
  }
}
