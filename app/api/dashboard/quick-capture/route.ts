import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/dashboard/quick-capture
 * Quick capture endpoint for fast entry from dashboard
 *
 * Supports creating todos, ideas, and transactions with minimal required fields
 *
 * Body: {
 *   type: 'todo' | 'idea' | 'transaction',
 *   title: string (required for todo/idea),
 *   description?: string,
 *   // Type-specific optional fields
 *   projectId?: string (for todo),
 *   priority?: string (for todo),
 *   dueDate?: string (for todo),
 *   category?: string (for idea/transaction),
 *   amount?: number (for transaction),
 *   transactionType?: 'income' | 'expense' (for transaction)
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
    const { type } = body

    if (!type || !['todo', 'idea', 'transaction'].includes(type)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Type must be one of: todo, idea, transaction',
        400
      )
    }

    let result: any

    switch (type) {
      case 'todo': {
        const { title, description, projectId, priority, dueDate } = body

        if (!title?.trim()) {
          return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required for todo', 400)
        }

        // Verify project ownership if provided
        if (projectId) {
          const projectCheck = await sql`
            SELECT 1 FROM projects WHERE id = ${projectId} AND user_id = ${userId} AND deleted_at IS NULL
          `
          if (projectCheck.length === 0) {
            return errorResponse(ErrorCodes.FORBIDDEN, 'Project not found or not accessible', 403)
          }
        }

        // Get next order index
        const maxOrder = await sql`
          SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
          FROM todos WHERE user_id = ${userId} AND deleted_at IS NULL
        `

        const todoResult = await sql`
          INSERT INTO todos (
            user_id, title, description, project_id, priority, due_date, order_index, status
          ) VALUES (
            ${userId},
            ${title.trim()},
            ${description?.trim() || null},
            ${projectId || null},
            ${priority || 'medium'},
            ${dueDate || null},
            ${maxOrder[0]?.next_order || 0},
            'pending'
          )
          RETURNING id, title, description, project_id, priority, due_date, status, created_at
        `

        result = {
          type: 'todo',
          data: {
            id: todoResult[0].id,
            title: todoResult[0].title,
            description: todoResult[0].description,
            projectId: todoResult[0].project_id,
            priority: todoResult[0].priority,
            dueDate: todoResult[0].due_date,
            status: todoResult[0].status,
            createdAt: todoResult[0].created_at
          }
        }
        break
      }

      case 'idea': {
        const { title, description, category, tags } = body

        if (!title?.trim()) {
          return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required for idea', 400)
        }

        const ideaResult = await sql`
          INSERT INTO ideas (
            user_id, title, description, category, tags, lifecycle
          ) VALUES (
            ${userId},
            ${title.trim()},
            ${description?.trim() || null},
            ${category?.trim() || null},
            ${tags ? JSON.stringify(tags) : '[]'},
            'seed'
          )
          RETURNING id, title, description, category, tags, lifecycle, created_at
        `

        result = {
          type: 'idea',
          data: {
            id: ideaResult[0].id,
            title: ideaResult[0].title,
            description: ideaResult[0].description,
            category: ideaResult[0].category,
            tags: ideaResult[0].tags || [],
            lifecycle: ideaResult[0].lifecycle,
            createdAt: ideaResult[0].created_at
          }
        }
        break
      }

      case 'transaction': {
        const {
          description,
          amount,
          transactionType,
          category,
          merchant,
          date,
          notes
        } = body

        if (amount === undefined || amount === null) {
          return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Amount is required for transaction', 400)
        }

        const txResult = await sql`
          INSERT INTO transactions (
            user_id, description, amount, type, category, merchant, date, notes
          ) VALUES (
            ${userId},
            ${description?.trim() || 'Quick entry'},
            ${Math.abs(amount)},
            ${transactionType || 'expense'},
            ${category?.trim() || null},
            ${merchant?.trim() || null},
            ${date || new Date().toISOString().split('T')[0]},
            ${notes?.trim() || null}
          )
          RETURNING id, description, amount, type, category, merchant, date, notes, created_at
        `

        result = {
          type: 'transaction',
          data: {
            id: txResult[0].id,
            description: txResult[0].description,
            amount: parseFloat(txResult[0].amount),
            transactionType: txResult[0].type,
            category: txResult[0].category,
            merchant: txResult[0].merchant,
            date: txResult[0].date,
            notes: txResult[0].notes,
            createdAt: txResult[0].created_at
          }
        }
        break
      }
    }

    return successResponse(result, undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/dashboard/quick-capture error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create entry',
      500,
      error.message
    )
  }
}
