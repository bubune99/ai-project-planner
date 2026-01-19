import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/todos/batch
 * Perform batch operations on multiple todos
 *
 * Body: {
 *   action: "complete" | "uncomplete" | "delete" | "update_priority" | "update_status"
 *   todoIds: string[] (required)
 *   value?: string (required for update_priority and update_status)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { action, todoIds, value } = body

    // Validate required fields
    if (!action) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'action is required', 400)
    }
    if (!Array.isArray(todoIds) || todoIds.length === 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'todoIds array is required', 400)
    }
    if (todoIds.length > 100) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Maximum 100 todos per batch', 400)
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

    let result: { affected: number; action: string; details?: any }

    switch (action) {
      case 'complete':
        await sql`
          UPDATE todos
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = ANY(${todoIds})
            AND user_id = ${userId}
            AND deleted_at IS NULL
        `
        result = { affected: todoIds.length, action: 'completed' }
        break

      case 'uncomplete':
        await sql`
          UPDATE todos
          SET status = 'pending', completed_at = NULL, updated_at = NOW()
          WHERE id = ANY(${todoIds})
            AND user_id = ${userId}
            AND deleted_at IS NULL
        `
        result = { affected: todoIds.length, action: 'uncompleted' }
        break

      case 'delete':
        await sql`
          UPDATE todos
          SET deleted_at = NOW()
          WHERE id = ANY(${todoIds})
            AND user_id = ${userId}
            AND deleted_at IS NULL
        `
        result = { affected: todoIds.length, action: 'deleted' }
        break

      case 'update_priority':
        const validPriorities = ['low', 'medium', 'high', 'urgent']
        if (!value || !validPriorities.includes(value)) {
          return errorResponse(
            ErrorCodes.VALIDATION_ERROR,
            `value must be one of: ${validPriorities.join(', ')}`,
            400
          )
        }
        await sql`
          UPDATE todos
          SET priority = ${value}, updated_at = NOW()
          WHERE id = ANY(${todoIds})
            AND user_id = ${userId}
            AND deleted_at IS NULL
        `
        result = { affected: todoIds.length, action: 'priority_updated', details: { priority: value } }
        break

      case 'update_status':
        const validStatuses = ['pending', 'in_progress', 'completed']
        if (!value || !validStatuses.includes(value)) {
          return errorResponse(
            ErrorCodes.VALIDATION_ERROR,
            `value must be one of: ${validStatuses.join(', ')}`,
            400
          )
        }
        await sql`
          UPDATE todos
          SET
            status = ${value},
            completed_at = CASE WHEN ${value} = 'completed' THEN NOW() ELSE NULL END,
            updated_at = NOW()
          WHERE id = ANY(${todoIds})
            AND user_id = ${userId}
            AND deleted_at IS NULL
        `
        result = { affected: todoIds.length, action: 'status_updated', details: { status: value } }
        break

      default:
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid action. Must be: complete, uncomplete, delete, update_priority, update_status',
          400
        )
    }

    return successResponse(result)
  } catch (error: any) {
    console.error('[API] POST /api/todos/batch error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to perform batch operation',
      500,
      error.message
    )
  }
}
