import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformRecurring(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    transactionType: row.transaction_type,
    amount: parseFloat(row.amount),
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    description: row.description,
    merchant: row.merchant,
    frequency: row.frequency,
    nextOccurrence: row.next_occurrence,
    endDate: row.end_date,
    autoCreate: row.auto_create,
    daysBeforeReminder: row.days_before_reminder,
    isActive: row.is_active,
    lastCreatedAt: row.last_created_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/recurring/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    const transactions = await sql`
      SELECT
        r.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon
      FROM finance_recurring_transactions r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN finance_categories c ON r.category_id = c.id
      WHERE r.id = ${id} AND r.user_id = ${userId}
    `

    if (transactions.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Recurring transaction not found', 404)
    }

    return successResponse(transformRecurring(transactions[0]))
  } catch (error: any) {
    console.error('[API] GET /api/finance/recurring/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get recurring transaction', 500, error.message)
  }
}

/**
 * PATCH /api/finance/recurring/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    const body = await request.json()

    // Verify ownership
    const existing = await sql`
      SELECT * FROM finance_recurring_transactions
      WHERE id = ${id} AND user_id = ${userId}
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Recurring transaction not found', 404)
    }

    const {
      accountId,
      transactionType,
      amount,
      currency,
      categoryId,
      description,
      merchant,
      frequency,
      nextOccurrence,
      endDate,
      autoCreate,
      daysBeforeReminder,
      isActive,
      metadata
    } = body

    await sql`
      UPDATE finance_recurring_transactions SET
        account_id = COALESCE(${accountId}, account_id),
        transaction_type = COALESCE(${transactionType}, transaction_type),
        amount = COALESCE(${amount}, amount),
        currency = COALESCE(${currency}, currency),
        category_id = COALESCE(${categoryId}, category_id),
        description = COALESCE(${description}, description),
        merchant = COALESCE(${merchant}, merchant),
        frequency = COALESCE(${frequency}, frequency),
        next_occurrence = COALESCE(${nextOccurrence}, next_occurrence),
        end_date = COALESCE(${endDate}, end_date),
        auto_create = COALESCE(${autoCreate}, auto_create),
        days_before_reminder = COALESCE(${daysBeforeReminder}, days_before_reminder),
        is_active = COALESCE(${isActive}, is_active),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
    `

    // Fetch updated with joins
    const updated = await sql`
      SELECT
        r.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon
      FROM finance_recurring_transactions r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN finance_categories c ON r.category_id = c.id
      WHERE r.id = ${id}
    `

    return successResponse(transformRecurring(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/recurring/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update recurring transaction', 500, error.message)
  }
}

/**
 * DELETE /api/finance/recurring/[id]
 * Hard delete (recurring transactions don't have soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    const result = await sql`
      DELETE FROM finance_recurring_transactions
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Recurring transaction not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/recurring/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete recurring transaction', 500, error.message)
  }
}
