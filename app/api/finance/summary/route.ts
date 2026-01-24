import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/finance/summary
 * Get financial summary for dashboard
 *
 * Query params:
 * - period: "week" | "month" | "quarter" | "year" (default: month)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'

    // Determine date range
    let startDate: string
    const endDate = 'NOW()'

    switch (period) {
      case 'week':
        startDate = "CURRENT_DATE - INTERVAL '7 days'"
        break
      case 'quarter':
        startDate = "date_trunc('quarter', CURRENT_DATE)"
        break
      case 'year':
        startDate = "date_trunc('year', CURRENT_DATE)"
        break
      default: // month
        startDate = "date_trunc('month', CURRENT_DATE)"
    }

    // Get account totals
    const accountSummary = await sql`
      SELECT
        SUM(CASE WHEN account_type NOT IN ('credit_card', 'loan') THEN current_balance ELSE 0 END) as total_assets,
        SUM(CASE WHEN account_type IN ('credit_card', 'loan') THEN ABS(current_balance) ELSE 0 END) as total_liabilities,
        COUNT(*) as account_count
      FROM finance_accounts
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND is_active = true
    `

    // Get period transactions summary
    const transactionSummary = await sql`
      SELECT
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as transaction_count
      FROM finance_transactions
      WHERE user_id = ${userId}
        AND transaction_date >= ${sql.unsafe(startDate)}
    `

    // Get spending by category for the period
    const categorySpending = await sql`
      SELECT
        c.name as category,
        c.icon,
        c.color,
        SUM(t.amount) as amount,
        COUNT(*) as count
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON t.category_id = c.id
      WHERE t.user_id = ${userId}
        AND t.transaction_type = 'expense'
        AND t.transaction_date >= ${sql.unsafe(startDate)}
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY amount DESC
      LIMIT 10
    `

    // Get budget status
    const budgetStatus = await sql`
      WITH current_spending AS (
        SELECT
          t.category_id,
          SUM(t.amount) as spent
        FROM finance_transactions t
        WHERE t.user_id = ${userId}
          AND t.transaction_type = 'expense'
          AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
        GROUP BY t.category_id
      )
      SELECT
        COUNT(*) as total_budgets,
        COUNT(*) FILTER (WHERE COALESCE(cs.spent, 0) > b.amount) as over_budget,
        COUNT(*) FILTER (WHERE COALESCE(cs.spent, 0) >= b.amount * 0.8 AND COALESCE(cs.spent, 0) <= b.amount) as near_limit,
        SUM(b.amount) as total_budgeted,
        SUM(COALESCE(cs.spent, 0)) as total_spent
      FROM finance_budgets b
      LEFT JOIN current_spending cs ON b.category_id = cs.category_id
      WHERE b.user_id = ${userId}
        AND b.is_active = true
        AND b.deleted_at IS NULL
    `

    // Get upcoming bills (from recurring transactions)
    const upcomingBills = await sql`
      SELECT
        r.id,
        r.description,
        r.merchant,
        r.amount,
        r.next_occurrence,
        c.name as category_name,
        c.icon as category_icon
      FROM finance_recurring_transactions r
      LEFT JOIN finance_categories c ON r.category_id = c.id
      WHERE r.user_id = ${userId}
        AND r.is_active = true
        AND r.transaction_type = 'expense'
        AND r.next_occurrence <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY r.next_occurrence ASC
      LIMIT 5
    `

    // Get income streams
    const incomeStreams = await sql`
      SELECT
        SUM(
          CASE frequency
            WHEN 'daily' THEN amount * 30
            WHEN 'weekly' THEN amount * 4
            WHEN 'biweekly' THEN amount * 2
            WHEN 'monthly' THEN amount
            WHEN 'quarterly' THEN amount / 3
            WHEN 'yearly' THEN amount / 12
            ELSE amount
          END
        ) as monthly_income,
        COUNT(*) as stream_count
      FROM finance_income_streams
      WHERE user_id = ${userId}
        AND is_active = true
        AND deleted_at IS NULL
    `

    // Get goals progress
    const goalsProgress = await sql`
      SELECT
        COUNT(*) as total_goals,
        COUNT(*) FILTER (WHERE is_completed) as completed_goals,
        SUM(target_amount) as total_target,
        SUM(current_amount) as total_saved,
        ROUND(AVG(current_amount / NULLIF(target_amount, 0) * 100), 2) as avg_progress
      FROM finance_goals
      WHERE user_id = ${userId}
        AND is_active = true
        AND deleted_at IS NULL
    `

    const assets = parseFloat(accountSummary[0]?.total_assets || '0')
    const liabilities = parseFloat(accountSummary[0]?.total_liabilities || '0')
    const income = parseFloat(transactionSummary[0]?.total_income || '0')
    const expenses = parseFloat(transactionSummary[0]?.total_expenses || '0')

    return successResponse({
      period,
      netWorth: {
        total: assets - liabilities,
        change: 0, // TODO: Calculate from historical data
        changePercent: 0, // TODO: Calculate from historical data
        assets,
        liabilities,
        accountCount: parseInt(accountSummary[0]?.account_count || '0')
      },
      income: {
        total: income
      },
      expenses: {
        total: expenses
      },
      cashFlow: {
        income,
        expenses,
        net: income - expenses,
        transactionCount: parseInt(transactionSummary[0]?.transaction_count || '0')
      },
      categorySpending: categorySpending.map(c => ({
        category: c.category || 'Uncategorized',
        icon: c.icon,
        color: c.color,
        amount: parseFloat(c.amount),
        count: parseInt(c.count)
      })),
      budgets: {
        total: parseInt(budgetStatus[0]?.total_budgets || '0'),
        overBudget: parseInt(budgetStatus[0]?.over_budget || '0'),
        nearLimit: parseInt(budgetStatus[0]?.near_limit || '0'),
        totalBudgeted: parseFloat(budgetStatus[0]?.total_budgeted || '0'),
        totalSpent: parseFloat(budgetStatus[0]?.total_spent || '0')
      },
      upcomingBills: upcomingBills.map(b => ({
        id: b.id,
        description: b.description || b.merchant,
        amount: parseFloat(b.amount),
        dueDate: b.next_occurrence,
        category: b.category_name,
        icon: b.category_icon
      })),
      monthlyIncome: parseFloat(incomeStreams[0]?.monthly_income || '0'),
      incomeStreamCount: parseInt(incomeStreams[0]?.stream_count || '0'),
      goals: {
        total: parseInt(goalsProgress[0]?.total_goals || '0'),
        completed: parseInt(goalsProgress[0]?.completed_goals || '0'),
        totalTarget: parseFloat(goalsProgress[0]?.total_target || '0'),
        totalSaved: parseFloat(goalsProgress[0]?.total_saved || '0'),
        avgProgress: parseFloat(goalsProgress[0]?.avg_progress || '0')
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/summary error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get summary', 500, error.message)
  }
}
