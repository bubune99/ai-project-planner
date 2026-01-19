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
    // Computed fields
    spent: row.spent ? parseFloat(row.spent) : 0,
    remaining: row.remaining ? parseFloat(row.remaining) : parseFloat(row.amount),
    percentUsed: row.percent_used ? parseFloat(row.percent_used) : 0
  }
}

/**
 * GET /api/finance/budgets
 * List all budgets with spending progress
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const activeOnly = searchParams.get('active') !== 'false'

    // Get budgets with current period spending
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
      WHERE b.user_id = ${userId}
        AND b.deleted_at IS NULL
        ${activeOnly ? sql`AND b.is_active = true` : sql``}
      ORDER BY percent_used DESC, b.name ASC
    `

    // Calculate total budget stats
    const totalBudgeted = budgets.reduce((sum, b) => sum + parseFloat(b.amount), 0)
    const totalSpent = budgets.reduce((sum, b) => sum + (parseFloat(b.spent) || 0), 0)

    return successResponse(budgets.map(transformBudget), {
      total: budgets.length,
      summary: {
        totalBudgeted,
        totalSpent,
        totalRemaining: totalBudgeted - totalSpent,
        overBudgetCount: budgets.filter(b => parseFloat(b.spent || 0) > parseFloat(b.amount)).length
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/budgets error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get budgets', 500, error.message)
  }
}

/**
 * POST /api/finance/budgets
 * Create a new budget
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
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
      color,
      icon,
      metadata
    } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Budget name is required', 400)
    }
    if (!amount || amount <= 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid positive amount is required', 400)
    }

    const result = await sql`
      INSERT INTO finance_budgets (
        user_id, name, category_id, amount, currency, period,
        start_date, end_date, alert_threshold, alert_enabled,
        rollover_enabled, color, icon, metadata
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${categoryId || null},
        ${amount},
        ${currency || 'USD'},
        ${period || 'monthly'},
        ${startDate || null},
        ${endDate || null},
        ${alertThreshold || 80},
        ${alertEnabled !== false},
        ${rolloverEnabled || false},
        ${color || null},
        ${icon || null},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformBudget(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/budgets error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create budget', 500, error.message)
  }
}
