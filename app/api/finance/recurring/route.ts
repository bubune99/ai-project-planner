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
 * GET /api/finance/recurring
 * List all recurring transactions
 *
 * Query params:
 * - type: income | expense
 * - active: true | false
 * - upcoming: true (only show with next_occurrence within 30 days)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type')
    const activeOnly = searchParams.get('active') !== 'false'
    const upcoming = searchParams.get('upcoming') === 'true'

    const transactions = await sql`
      SELECT
        r.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon
      FROM finance_recurring_transactions r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN finance_categories c ON r.category_id = c.id
      WHERE r.user_id = ${userId}
        ${activeOnly ? sql`AND r.is_active = true` : sql``}
        ${type ? sql`AND r.transaction_type = ${type}` : sql``}
        ${upcoming ? sql`AND r.next_occurrence <= CURRENT_DATE + INTERVAL '30 days'` : sql``}
      ORDER BY r.next_occurrence ASC, r.amount DESC
    `

    // Calculate monthly totals
    const totals = transactions.reduce((acc, t) => {
      const amount = parseFloat(t.amount)
      let monthlyAmount: number
      switch (t.frequency) {
        case 'daily': monthlyAmount = amount * 30; break
        case 'weekly': monthlyAmount = amount * 4; break
        case 'biweekly': monthlyAmount = amount * 2; break
        case 'monthly': monthlyAmount = amount; break
        case 'quarterly': monthlyAmount = amount / 3; break
        case 'yearly': monthlyAmount = amount / 12; break
        default: monthlyAmount = amount
      }

      if (t.transaction_type === 'income') {
        acc.monthlyIncome += monthlyAmount
      } else {
        acc.monthlyExpenses += monthlyAmount
      }
      return acc
    }, { monthlyIncome: 0, monthlyExpenses: 0 })

    return successResponse(transactions.map(transformRecurring), {
      total: transactions.length,
      monthlyIncome: Math.round(totals.monthlyIncome * 100) / 100,
      monthlyExpenses: Math.round(totals.monthlyExpenses * 100) / 100,
      monthlyNet: Math.round((totals.monthlyIncome - totals.monthlyExpenses) * 100) / 100
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/recurring error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get recurring transactions', 500, error.message)
  }
}

/**
 * POST /api/finance/recurring
 * Create a new recurring transaction template
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
      metadata
    } = body

    if (!accountId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Account ID is required', 400)
    }
    if (!transactionType || !['income', 'expense'].includes(transactionType)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid transaction type is required', 400)
    }
    if (!amount || amount <= 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid positive amount is required', 400)
    }
    if (!frequency) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Frequency is required', 400)
    }
    if (!nextOccurrence) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Next occurrence date is required', 400)
    }

    // Verify account ownership
    const account = await sql`
      SELECT id FROM finance_accounts
      WHERE id = ${accountId} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (account.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Account not found', 404)
    }

    const result = await sql`
      INSERT INTO finance_recurring_transactions (
        user_id, account_id, transaction_type, amount, currency,
        category_id, description, merchant, frequency, next_occurrence,
        end_date, auto_create, days_before_reminder, metadata
      ) VALUES (
        ${userId},
        ${accountId},
        ${transactionType},
        ${amount},
        ${currency || 'USD'},
        ${categoryId || null},
        ${description || null},
        ${merchant || null},
        ${frequency},
        ${nextOccurrence},
        ${endDate || null},
        ${autoCreate || false},
        ${daysBeforeReminder || 3},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    // Fetch with joins
    const full = await sql`
      SELECT
        r.*,
        a.name as account_name,
        c.name as category_name,
        c.icon as category_icon
      FROM finance_recurring_transactions r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN finance_categories c ON r.category_id = c.id
      WHERE r.id = ${result[0].id}
    `

    return successResponse(transformRecurring(full[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/recurring error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create recurring transaction', 500, error.message)
  }
}
