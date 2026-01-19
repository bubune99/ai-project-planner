import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { Todo } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend Todo format
 */
function transformTodo(row: any): Todo {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    ideaId: row.idea_id,
    transactionId: row.transaction_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    orderIndex: row.order_index,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    project: row.project_name ? {
      id: row.project_id,
      name: row.project_name
    } : null,
    idea: row.idea_title ? {
      id: row.idea_id,
      title: row.idea_title
    } : null,
    transaction: row.transaction_description ? {
      id: row.transaction_id,
      description: row.transaction_description,
      amount: row.transaction_amount
    } : null
  }
}

/**
 * POST /api/todos/[id]/toggle
 * Quick toggle between pending/completed status
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

    // Get current status
    const current = await sql`
      SELECT status FROM todos
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (current.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const currentStatus = current[0].status
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'

    // Toggle status
    const result = await sql`
      UPDATE todos
      SET
        status = ${newStatus},
        completed_at = CASE
          WHEN ${newStatus} = 'completed' THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${id}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      RETURNING *
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const todo = result[0]

    // Get project name if linked
    let projectName = null
    if (todo.project_id) {
      const projectResult = await sql`
        SELECT name FROM projects WHERE id = ${todo.project_id}
      `
      projectName = projectResult[0]?.name
    }

    return successResponse(transformTodo({
      ...todo,
      project_name: projectName
    }))
  } catch (error: any) {
    console.error('[API] POST /api/todos/[id]/toggle error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to toggle todo',
      500,
      error.message
    )
  }
}
