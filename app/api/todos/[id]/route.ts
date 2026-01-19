import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import type { Todo } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend Todo format
 * Converts snake_case to camelCase and includes cross-domain links
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
 * Verify user owns a todo
 */
async function verifyTodoOwnership(todoId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM todos WHERE id = ${todoId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return result.length > 0
}

/**
 * Verify user owns an idea (cross-domain linking)
 */
async function verifyIdeaOwnership(ideaId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return result.length > 0
}

/**
 * Verify user owns a transaction (cross-domain linking)
 */
async function verifyTransactionOwnership(transactionId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM finance_transactions WHERE id = ${transactionId} AND user_id = ${userId}
  `
  return result.length > 0
}

/**
 * GET /api/todos/[id]
 * Get a single todo
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

    // Get the todo with cross-domain info (project, idea, transaction)
    const result = await sql`
      SELECT
        t.*,
        p.name as project_name,
        i.title as idea_title,
        ft.description as transaction_description,
        ft.amount as transaction_amount
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN ideas i ON t.idea_id = i.id
      LEFT JOIN finance_transactions ft ON t.transaction_id = ft.id
      WHERE t.id = ${id}
        AND t.user_id = ${userId}
        AND t.deleted_at IS NULL
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    return successResponse(transformTodo(result[0]))
  } catch (error: any) {
    console.error('[API] GET /api/todos/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get todo',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/todos/[id]
 * Update a todo with cross-domain linking support
 *
 * Body: {
 *   title?: string
 *   description?: string
 *   status?: "pending" | "in_progress" | "completed"
 *   priority?: "low" | "medium" | "high" | "urgent"
 *   dueDate?: ISO date
 *   projectId?: UUID (link to project)
 *   ideaId?: UUID (link to idea - cross-domain)
 *   transactionId?: UUID (link to transaction - cross-domain)
 *   metadata?: object
 * }
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

    // Verify ownership
    const hasAccess = await verifyTodoOwnership(id, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const body = await request.json()
    const { title, description, status, priority, dueDate, projectId, ideaId, transactionId, metadata } = body

    // Verify ownership for cross-domain links
    if (projectId !== undefined && projectId !== null) {
      const hasProjectAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasProjectAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this project', 403)
      }
    }

    if (ideaId !== undefined && ideaId !== null) {
      const hasIdeaAccess = await verifyIdeaOwnership(ideaId, userId)
      if (!hasIdeaAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this idea', 403)
      }
    }

    if (transactionId !== undefined && transactionId !== null) {
      const hasTransactionAccess = await verifyTransactionOwnership(transactionId, userId)
      if (!hasTransactionAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this transaction', 403)
      }
    }

    // Build update query with only provided fields (including cross-domain links)
    const result = await sql`
      UPDATE todos
      SET
        title = COALESCE(${title !== undefined ? title.trim() : null}, title),
        description = CASE
          WHEN ${description !== undefined} THEN ${description?.trim() || null}
          ELSE description
        END,
        status = COALESCE(${status || null}, status),
        priority = COALESCE(${priority || null}, priority),
        due_date = CASE
          WHEN ${dueDate !== undefined} THEN ${dueDate || null}::timestamp
          ELSE due_date
        END,
        project_id = CASE
          WHEN ${projectId !== undefined} THEN ${projectId || null}::uuid
          ELSE project_id
        END,
        idea_id = CASE
          WHEN ${ideaId !== undefined} THEN ${ideaId || null}::uuid
          ELSE idea_id
        END,
        transaction_id = CASE
          WHEN ${transactionId !== undefined} THEN ${transactionId || null}::uuid
          ELSE transaction_id
        END,
        metadata = CASE
          WHEN ${metadata !== undefined} THEN ${metadata ? JSON.stringify(metadata) : '{}'}::jsonb
          ELSE metadata
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

    // Get linked entity names for response
    let projectName = null
    let ideaTitle = null
    let transactionDescription = null
    let transactionAmount = null

    if (todo.project_id) {
      const projectResult = await sql`SELECT name FROM projects WHERE id = ${todo.project_id}`
      projectName = projectResult[0]?.name
    }

    if (todo.idea_id) {
      const ideaResult = await sql`SELECT title FROM ideas WHERE id = ${todo.idea_id}`
      ideaTitle = ideaResult[0]?.title
    }

    if (todo.transaction_id) {
      const txResult = await sql`SELECT description, amount FROM finance_transactions WHERE id = ${todo.transaction_id}`
      transactionDescription = txResult[0]?.description
      transactionAmount = txResult[0]?.amount
    }

    return successResponse(transformTodo({
      ...todo,
      project_name: projectName,
      idea_title: ideaTitle,
      transaction_description: transactionDescription,
      transaction_amount: transactionAmount
    }))
  } catch (error: any) {
    console.error('[API] PATCH /api/todos/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update todo',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/todos/[id]
 * Soft delete a todo
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

    // Soft delete the todo
    const result = await sql`
      UPDATE todos
      SET deleted_at = NOW()
      WHERE id = ${id}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    return successResponse({ id, deleted: true })
  } catch (error: any) {
    console.error('[API] DELETE /api/todos/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete todo',
      500,
      error.message
    )
  }
}
