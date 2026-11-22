import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { userDay } from '@/lib/settings/user-day'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'
import { money } from '@/lib/finance/dashboard-figures'
import { parseQuickTransaction, pickAccount, type OwnAccount } from '@/lib/finance/quick-capture'

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
 *   category?: string (for idea; for transaction, the name of one of the person's or the built-in categories),
 *   // transaction (written to finance_transactions; rules in lib/finance/quick-capture.ts)
 *   amount: number (required, above zero),
 *   transactionType?: 'income' | 'expense' (default expense),
 *   accountId?: string (required when the person has more than one account),
 *   categoryId?: string, merchant?: string, notes?: string, date?: YYYY-MM-DD (default today)
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
        const parsed = parseQuickTransaction(body, (await userDay(userId)).today)
        if (!parsed.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, parsed.message, 400)
        const tx = parsed.value

        // A transaction belongs to one of the person's own open accounts (account_id is required).
        const accounts = await sql`
          SELECT id, currency FROM finance_accounts
          WHERE user_id = ${userId} AND deleted_at IS NULL AND is_active = true
        `
        const picked = pickAccount(accounts as OwnAccount[], tx.accountId)
        if (!picked.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, picked.message, 400)

        // The category, by id or by name, among the person's own and the built-in ones.
        let categoryId: string | null = null
        if (tx.categoryId || tx.categoryName) {
          const category = await sql`
            SELECT id FROM finance_categories
            WHERE (user_id = ${userId} OR user_id IS NULL)
              AND ${tx.categoryId ? sql`id = ${tx.categoryId}` : sql`LOWER(name) = LOWER(${tx.categoryName})`}
            ORDER BY user_id NULLS LAST, parent_id NULLS FIRST
            LIMIT 1
          `
          if (category.length === 0) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, `No category ${tx.categoryId ? 'with that id' : `named "${tx.categoryName}"`}`, 400)
          }
          categoryId = category[0].id
        }

        // The same 5W+H envelope POST /api/finance/transactions writes.
        const title = tx.description || tx.merchant || `${tx.transactionType} ${tx.amount} ${picked.account.currency}`
        const envelope = buildEnvelopeForWrite(
          body,
          { userId, projectId: undefined, agentId: undefined },
          { type: 'finance_transaction', title, summary: title, rationale: body?.documentation_5wh?.why?.rationale },
          'legacy'
        )

        // The insert also moves the account's balance: trigger_update_account_balance (migration 028).
        const txResult = await sql`
          INSERT INTO finance_transactions (
            user_id, account_id, transaction_type, amount, currency,
            category_id, description, merchant, notes, transaction_date, documentation_5wh
          ) VALUES (
            ${userId},
            ${picked.account.id},
            ${tx.transactionType},
            ${tx.amount},
            ${picked.account.currency},
            ${categoryId},
            ${tx.description},
            ${tx.merchant},
            ${tx.notes},
            ${tx.date},
            ${envelope.ok ? envelopeForSql(envelope.envelope) : '{}'}::jsonb
          )
          RETURNING id, account_id, transaction_type, amount, currency, category_id, description, merchant, notes, transaction_date, created_at
        `

        result = {
          type: 'transaction',
          data: {
            id: txResult[0].id,
            accountId: txResult[0].account_id,
            description: txResult[0].description,
            amount: money(txResult[0].amount),
            currency: txResult[0].currency,
            transactionType: txResult[0].transaction_type,
            categoryId: txResult[0].category_id,
            merchant: txResult[0].merchant,
            date: txResult[0].transaction_date,
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
