import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { userDay } from '@/lib/settings/user-day'
import { monthWindow } from '@/lib/settings/day'
import { budgetFigures, monthFigures, type BudgetTotal, type TypeTotal } from '@/lib/finance/dashboard-figures'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard
 * Get unified dashboard statistics across all domains
 *
 * Returns aggregated stats for:
 * - Projects: total, active, completed, blocked
 * - Ideas: total by lifecycle stage
 * - Todos: today, overdue, upcoming
 * - Finance: this month's spending and income, the monthly budgets in force
 * - Memory: decision count, recent lessons
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    const { today } = await userDay(userId)
    const thisMonth = monthWindow(today)

    // Get project stats
    const projectStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total,
        COUNT(*) FILTER (WHERE status = 'in-progress' AND deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) as completed,
        COUNT(*) FILTER (WHERE status = 'on-hold' AND deleted_at IS NULL) as on_hold,
        COUNT(*) FILTER (WHERE status = 'planning' AND deleted_at IS NULL) as planning
      FROM projects
      WHERE user_id = ${userId}
    `

    // Get blocked steps count
    const blockedSteps = await sql`
      SELECT COUNT(*) as count
      FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE p.user_id = ${userId}
        AND ps.status = 'blocked'
        AND p.deleted_at IS NULL
    `

    // Get idea stats by lifecycle
    const ideaStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total,
        COUNT(*) FILTER (WHERE lifecycle = 'seed' AND deleted_at IS NULL) as seed,
        COUNT(*) FILTER (WHERE lifecycle = 'exploring' AND deleted_at IS NULL) as exploring,
        COUNT(*) FILTER (WHERE lifecycle = 'refined' AND deleted_at IS NULL) as refined,
        COUNT(*) FILTER (WHERE lifecycle = 'promoted' AND deleted_at IS NULL) as promoted,
        COUNT(*) FILTER (WHERE lifecycle = 'archived' AND deleted_at IS NULL) as archived
      FROM ideas
      WHERE user_id = ${userId}
    `

    // Get todo stats
    const todoStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completed' AND deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) as completed,
        COUNT(*) FILTER (WHERE due_date::date = ${today}::date AND status != 'completed' AND deleted_at IS NULL) as today,
        COUNT(*) FILTER (WHERE due_date < ${today}::date AND status != 'completed' AND deleted_at IS NULL) as overdue,
        COUNT(*) FILTER (WHERE due_date > ${today}::date AND due_date <= ${today}::date + INTERVAL '7 days' AND status != 'completed' AND deleted_at IS NULL) as upcoming
      FROM todos
      WHERE user_id = ${userId}
    `

    // Finance, this month: finance_transactions and finance_budgets (migration 028). The rules are in lib/finance/dashboard-figures.
    const monthTotals = await sql`
      SELECT transaction_type, currency, SUM(amount) AS total, COUNT(*) AS count
      FROM finance_transactions
      WHERE user_id = ${userId}
        AND transaction_date >= ${thisMonth.start}::date
        AND transaction_date < ${thisMonth.end}::date
      GROUP BY transaction_type, currency
    `

    // Budgets in force today: active, not deleted, and inside their own dates when they have them.
    const budgetTotals = await sql`
      SELECT period, currency, SUM(amount) AS total, COUNT(*) AS count
      FROM finance_budgets
      WHERE user_id = ${userId}
        AND is_active = true
        AND deleted_at IS NULL
        AND (start_date IS NULL OR start_date <= ${today}::date)
        AND (end_date IS NULL OR end_date >= ${today}::date)
      GROUP BY period, currency
    `
    const month = monthFigures(monthTotals as TypeTotal[])
    const budgets = budgetFigures(budgetTotals as BudgetTotal[])

    // Get memory stats
    const memoryStats = await sql`
      SELECT
        (SELECT COUNT(*) FROM mlp_why_decisions WHERE user_id = ${userId}) as decisions,
        (SELECT COUNT(*) FROM mlp_why_attempts a JOIN mlp_why_decisions d ON d.id = a.episode_id WHERE d.user_id = ${userId}) as lessons,
        (SELECT COUNT(*) FROM mlp_who_collaborators WHERE user_id = ${userId}) as collaborators,
        (SELECT COUNT(*) FROM mlp_when_milestones WHERE user_id = ${userId}) as milestones
    `

    // Get recent milestones (upcoming)
    const upcomingMilestones = await sql`
      SELECT id, title, target_date, status, project_id
      FROM mlp_when_milestones
      WHERE user_id = ${userId}
        AND status = 'pending'
        AND target_date >= ${today}::date
      ORDER BY target_date ASC
      LIMIT 3
    `

    return successResponse({
      projects: {
        total: parseInt(projectStats[0]?.total || '0'),
        active: parseInt(projectStats[0]?.active || '0'),
        completed: parseInt(projectStats[0]?.completed || '0'),
        onHold: parseInt(projectStats[0]?.on_hold || '0'),
        planning: parseInt(projectStats[0]?.planning || '0'),
        blockedSteps: parseInt(blockedSteps[0]?.count || '0')
      },
      ideas: {
        total: parseInt(ideaStats[0]?.total || '0'),
        seed: parseInt(ideaStats[0]?.seed || '0'),
        exploring: parseInt(ideaStats[0]?.exploring || '0'),
        refined: parseInt(ideaStats[0]?.refined || '0'),
        promoted: parseInt(ideaStats[0]?.promoted || '0'),
        archived: parseInt(ideaStats[0]?.archived || '0')
      },
      todos: {
        active: parseInt(todoStats[0]?.active || '0'),
        completed: parseInt(todoStats[0]?.completed || '0'),
        today: parseInt(todoStats[0]?.today || '0'),
        overdue: parseInt(todoStats[0]?.overdue || '0'),
        upcoming: parseInt(todoStats[0]?.upcoming || '0')
      },
      // A total is null when the money is in more than one currency; show "–" for it, never a sum.
      finance: {
        monthSpending: month.monthSpending,
        monthIncome: month.monthIncome,
        transactionCount: month.transactionCount,
        currency: month.currency,
        monthlyBudget: budgets.monthlyBudget,
        monthlyBudgetCount: budgets.monthlyBudgetCount,
        budgetCount: budgets.budgetCount,
        budgetCurrency: budgets.currency
      },
      memory: {
        decisions: parseInt(memoryStats[0]?.decisions || '0'),
        lessons: parseInt(memoryStats[0]?.lessons || '0'),
        collaborators: parseInt(memoryStats[0]?.collaborators || '0'),
        milestones: parseInt(memoryStats[0]?.milestones || '0')
      },
      upcomingMilestones: upcomingMilestones.map(m => ({
        id: m.id,
        title: m.title,
        targetDate: m.target_date,
        status: m.status,
        projectId: m.project_id
      }))
    })
  } catch (error: any) {
    console.error('[API] GET /api/dashboard error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get dashboard stats',
      500,
      error.message
    )
  }
}
