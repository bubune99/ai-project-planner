import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformBudget(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    amount: parseFloat(row.amount),
    currency: row.currency,
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    alertThreshold: row.alert_threshold,
    alertEnabled: row.alert_enabled,
    rolloverEnabled: row.rollover_enabled,
    rolloverAmount: row.rollover_amount ? parseFloat(row.rollover_amount) : 0,
    isActive: row.is_active,
    color: row.color,
    icon: row.icon,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    spent: row.spent ? parseFloat(row.spent) : 0,
    remaining: row.remaining ? parseFloat(row.remaining) : parseFloat(row.amount),
    percentUsed: row.percent_used ? parseFloat(row.percent_used) : 0
  }
}

/**
 * GET /api/finance/budgets/[id]
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

    const budgets = await sql`
      WITH current_spending AS (
        SELECT
          t.category_id,
          SUM(t.amount) as spent
        FROM finance_transactions t
        WHERE t.user_id = ${userId}
          AND t.transaction_type = 'expense'
          AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
          AND t.transaction_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        GROUP BY t.category_id
      )
      SELECT
        b.*,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        COALESCE(cs.spent, 0) as spent,
        b.amount - COALESCE(cs.spent, 0) as remaining,
        CASE
          WHEN b.amount > 0 THEN ROUND((COALESCE(cs.spent, 0) / b.amount) * 100, 2)
          ELSE 0
        END as percent_used
      FROM finance_budgets b
      LEFT JOIN finance_categories c ON b.category_id = c.id
      LEFT JOIN current_spending cs ON b.category_id = cs.category_id
      WHERE b.id = ${id} AND b.user_id = ${userId} AND b.deleted_at IS NULL
    `

    if (budgets.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Budget not found', 404)
    }

    return successResponse(transformBudget(budgets[0]))
  } catch (error: any) {
    console.error('[API] GET /api/finance/budgets/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get budget', 500, error.message)
  }
}

/**
 * PATCH /api/finance/budgets/[id]
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
      SELECT * FROM finance_budgets
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Budget not found', 404)
    }

    const {
      name,
      categoryId,
      amount,
      currency,
      period,
      startDate,
      endDate,
      alertThreshold,
      alertEnabled,
      rolloverEnabled,
      rolloverAmount,
      isActive,
      color,
      icon,
      metadata
    } = body

    await sql`
      UPDATE finance_budgets SET
        name = COALESCE(${name}, name),
        category_id = COALESCE(${categoryId}, category_id),
        amount = COALESCE(${amount}, amount),
        currency = COALESCE(${currency}, currency),
        period = COALESCE(${period}, period),
        start_date = COALESCE(${startDate}, start_date),
        end_date = COALESCE(${endDate}, end_date),
        alert_threshold = COALESCE(${alertThreshold}, alert_threshold),
        alert_enabled = COALESCE(${alertEnabled}, alert_enabled),
        rollover_enabled = COALESCE(${rolloverEnabled}, rollover_enabled),
        rollover_amount = COALESCE(${rolloverAmount}, rollover_amount),
        is_active = COALESCE(${isActive}, is_active),
        color = COALESCE(${color}, color),
        icon = COALESCE(${icon}, icon),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
    `

    // Fetch updated budget with computed fields
    const updated = await sql`
      WITH current_spending AS (
        SELECT
          t.category_id,
          SUM(t.amount) as spent
        FROM finance_transactions t
        WHERE t.user_id = ${userId}
          AND t.transaction_type = 'expense'
          AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
          AND t.transaction_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        GROUP BY t.category_id
      )
      SELECT
        b.*,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        COALESCE(cs.spent, 0) as spent,
        b.amount - COALESCE(cs.spent, 0) as remaining,
        CASE
          WHEN b.amount > 0 THEN ROUND((COALESCE(cs.spent, 0) / b.amount) * 100, 2)
          ELSE 0
        END as percent_used
      FROM finance_budgets b
      LEFT JOIN finance_categories c ON b.category_id = c.id
      LEFT JOIN current_spending cs ON b.category_id = cs.category_id
      WHERE b.id = ${id}
    `

    return successResponse(transformBudget(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/budgets/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update budget', 500, error.message)
  }
}

/**
 * DELETE /api/finance/budgets/[id]
 * Soft delete a budget
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
      UPDATE finance_budgets
      SET deleted_at = NOW(), is_active = false
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Budget not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/budgets/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete budget', 500, error.message)
  }
}
