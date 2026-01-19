import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import type { Todo } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend Todo format
 * Converts snake_case to camelCase
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
 * Verify user owns an idea
 */
async function verifyIdeaOwnership(ideaId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return result.length > 0
}

/**
 * Verify user owns a transaction
 */
async function verifyTransactionOwnership(transactionId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM finance_transactions WHERE id = ${transactionId} AND user_id = ${userId}
  `
  return result.length > 0
}

/**
 * GET /api/todos
 * List todos for authenticated user with optional filters
 *
 * Query params:
 * - view: "today" | "upcoming" | "overdue" | "all" | "completed" (default: "all")
 * - projectId: UUID (filter by project)
 * - ideaId: UUID (filter by idea - cross-domain)
 * - transactionId: UUID (filter by transaction - cross-domain)
 * - status: "pending" | "in_progress" | "completed"
 * - priority: "low" | "medium" | "high" | "urgent"
 * - unlinked: "true" (only standalone todos without any domain link)
 * - search: string (search in title/description)
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const view = searchParams.get('view') || 'all'
    const projectId = searchParams.get('projectId')
    const ideaId = searchParams.get('ideaId')
    const transactionId = searchParams.get('transactionId')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const unlinked = searchParams.get('unlinked') === 'true'
    const search = searchParams.get('search')

    // Build the base query with cross-domain joins
    let todos: any[]

    // Common cross-domain filter conditions
    const crossDomainFilters = sql`
      ${projectId ? sql`AND t.project_id = ${projectId}` : sql``}
      ${ideaId ? sql`AND t.idea_id = ${ideaId}` : sql``}
      ${transactionId ? sql`AND t.transaction_id = ${transactionId}` : sql``}
      ${status ? sql`AND t.status = ${status}` : sql``}
      ${priority ? sql`AND t.priority = ${priority}` : sql``}
      ${unlinked ? sql`AND t.project_id IS NULL AND t.idea_id IS NULL AND t.transaction_id IS NULL` : sql``}
      ${search ? sql`AND (t.title ILIKE ${'%' + search + '%'} OR t.description ILIKE ${'%' + search + '%'})` : sql``}
    `

    if (view === 'today') {
      // Today: due_date is today
      todos = await sql`
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
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND t.due_date::date = CURRENT_DATE
          AND t.status != 'completed'
          ${crossDomainFilters}
        ORDER BY t.order_index ASC, t.due_date ASC NULLS LAST, t.created_at DESC
      `
    } else if (view === 'upcoming') {
      // Upcoming: due_date within next 7 days (excluding today)
      todos = await sql`
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
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND t.due_date > CURRENT_DATE
          AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'
          AND t.status != 'completed'
          ${crossDomainFilters}
        ORDER BY t.due_date ASC, t.order_index ASC, t.created_at DESC
      `
    } else if (view === 'overdue') {
      // Overdue: due_date is before today and not completed
      todos = await sql`
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
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND t.due_date < CURRENT_DATE
          AND t.status != 'completed'
          ${crossDomainFilters}
        ORDER BY t.due_date ASC, t.priority DESC, t.created_at DESC
      `
    } else if (view === 'completed') {
      // Completed todos
      todos = await sql`
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
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND t.status = 'completed'
          ${crossDomainFilters}
        ORDER BY t.completed_at DESC, t.created_at DESC
        LIMIT 50
      `
    } else {
      // All (non-completed by default unless status filter is set)
      todos = await sql`
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
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          ${!status ? sql`AND t.status != 'completed'` : sql``}
          ${crossDomainFilters}
        ORDER BY t.order_index ASC, t.due_date ASC NULLS LAST, t.created_at DESC
      `
    }

    // Transform to frontend format
    const transformedTodos = todos.map(transformTodo)

    // Get counts for metadata
    const counts = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completed' AND deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) as completed,
        COUNT(*) FILTER (WHERE due_date::date = CURRENT_DATE AND status != 'completed' AND deleted_at IS NULL) as today,
        COUNT(*) FILTER (WHERE due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days' AND status != 'completed' AND deleted_at IS NULL) as upcoming,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed' AND deleted_at IS NULL) as overdue
      FROM todos
      WHERE user_id = ${userId}
    `

    return successResponse(transformedTodos, {
      total: transformedTodos.length,
      counts: {
        active: parseInt(counts[0]?.active || '0'),
        completed: parseInt(counts[0]?.completed || '0'),
        today: parseInt(counts[0]?.today || '0'),
        upcoming: parseInt(counts[0]?.upcoming || '0'),
        overdue: parseInt(counts[0]?.overdue || '0')
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/todos error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get todos',
      500,
      error.message
    )
  }
}

/**
 * POST /api/todos
 * Create a new todo
 *
 * Body: {
 *   title: string (required)
 *   description?: string
 *   projectId?: UUID (link to project)
 *   ideaId?: UUID (link to idea - cross-domain)
 *   transactionId?: UUID (link to transaction - cross-domain)
 *   priority?: "low" | "medium" | "high" | "urgent"
 *   dueDate?: ISO date
 *   metadata?: object
 * }
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
    const { title, description, projectId, ideaId, transactionId, priority, dueDate, metadata } = body

    // Validate required fields
    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }

    // Verify ownership for cross-domain links
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this project', 403)
      }
    }

    if (ideaId) {
      const hasAccess = await verifyIdeaOwnership(ideaId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this idea', 403)
      }
    }

    if (transactionId) {
      const hasAccess = await verifyTransactionOwnership(transactionId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this transaction', 403)
      }
    }

    // Get the next order_index for the user
    const maxOrder = await sql`
      SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
      FROM todos
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `
    const nextOrder = maxOrder[0]?.next_order || 0

    // Insert the todo with cross-domain links
    const result = await sql`
      INSERT INTO todos (
        user_id,
        project_id,
        idea_id,
        transaction_id,
        title,
        description,
        priority,
        due_date,
        order_index,
        metadata
      ) VALUES (
        ${userId},
        ${projectId || null},
        ${ideaId || null},
        ${transactionId || null},
        ${title.trim()},
        ${description?.trim() || null},
        ${priority || 'medium'},
        ${dueDate || null},
        ${nextOrder},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

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
    }), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/todos error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create todo',
      500,
      error.message
    )
  }
}
