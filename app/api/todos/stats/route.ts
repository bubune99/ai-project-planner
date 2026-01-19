import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/todos/stats
 * Get productivity statistics for todos
 *
 * Query params:
 * - projectId: UUID (optional, filter by project)
 * - period: "day" | "week" | "month" | "all" (default: "week")
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const period = searchParams.get('period') || 'week'

    // Calculate period start date
    let periodStart: string
    switch (period) {
      case 'day':
        periodStart = 'CURRENT_DATE'
        break
      case 'week':
        periodStart = "CURRENT_DATE - INTERVAL '7 days'"
        break
      case 'month':
        periodStart = "CURRENT_DATE - INTERVAL '30 days'"
        break
      case 'all':
        periodStart = "'1970-01-01'"
        break
      default:
        periodStart = "CURRENT_DATE - INTERVAL '7 days'"
    }

    // Overall stats
    const overallStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total,
        COUNT(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) as completed,
        COUNT(*) FILTER (WHERE status = 'pending' AND deleted_at IS NULL) as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND deleted_at IS NULL) as in_progress,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed' AND deleted_at IS NULL) as overdue,
        COUNT(*) FILTER (WHERE due_date::date = CURRENT_DATE AND status != 'completed' AND deleted_at IS NULL) as due_today,
        COUNT(*) FILTER (WHERE due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days' AND status != 'completed' AND deleted_at IS NULL) as due_this_week
      FROM todos
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    // Completion rate for the period
    const periodStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_in_period,
        COUNT(*) as created_in_period
      FROM todos
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND created_at >= ${periodStart}::timestamp
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    // Completed by day (last 7 days for trend)
    const completionTrend = await sql`
      SELECT
        DATE(completed_at) as date,
        COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND status = 'completed'
        AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
      GROUP BY DATE(completed_at)
      ORDER BY date DESC
    `

    // Priority distribution
    const priorityDistribution = await sql`
      SELECT
        priority,
        COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND status != 'completed'
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
      GROUP BY priority
    `

    // Top projects by incomplete todos
    const projectBreakdown = await sql`
      SELECT
        p.id,
        p.name,
        COUNT(*) FILTER (WHERE t.status != 'completed') as pending_count,
        COUNT(*) FILTER (WHERE t.status = 'completed') as completed_count
      FROM todos t
      JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ${userId}
        AND t.deleted_at IS NULL
        AND t.project_id IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY pending_count DESC
      LIMIT 5
    `

    // Standalone todos count
    const standaloneTodos = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completed') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM todos
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND project_id IS NULL
    `

    // Calculate streaks
    const streakData = await sql`
      WITH daily_completions AS (
        SELECT DISTINCT DATE(completed_at) as completion_date
        FROM todos
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND status = 'completed'
          AND completed_at >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY completion_date DESC
      ),
      streak_calc AS (
        SELECT
          completion_date,
          completion_date - (ROW_NUMBER() OVER (ORDER BY completion_date DESC))::int AS streak_group
        FROM daily_completions
      )
      SELECT
        COUNT(*) as current_streak
      FROM streak_calc
      WHERE streak_group = (SELECT streak_group FROM streak_calc WHERE completion_date = CURRENT_DATE OR completion_date = CURRENT_DATE - 1 LIMIT 1)
    `

    const stats = {
      overview: {
        total: parseInt(overallStats[0]?.total || '0'),
        completed: parseInt(overallStats[0]?.completed || '0'),
        pending: parseInt(overallStats[0]?.pending || '0'),
        inProgress: parseInt(overallStats[0]?.in_progress || '0'),
        overdue: parseInt(overallStats[0]?.overdue || '0'),
        dueToday: parseInt(overallStats[0]?.due_today || '0'),
        dueThisWeek: parseInt(overallStats[0]?.due_this_week || '0')
      },
      period: {
        name: period,
        completedInPeriod: parseInt(periodStats[0]?.completed_in_period || '0'),
        createdInPeriod: parseInt(periodStats[0]?.created_in_period || '0'),
        completionRate: periodStats[0]?.created_in_period > 0
          ? Math.round((parseInt(periodStats[0].completed_in_period) / parseInt(periodStats[0].created_in_period)) * 100)
          : 0
      },
      completionTrend: completionTrend.map(row => ({
        date: row.date,
        count: parseInt(row.count)
      })),
      priorityDistribution: priorityDistribution.reduce((acc: any, row) => {
        acc[row.priority] = parseInt(row.count)
        return acc
      }, { low: 0, medium: 0, high: 0, urgent: 0 }),
      projectBreakdown: projectBreakdown.map(row => ({
        id: row.id,
        name: row.name,
        pendingCount: parseInt(row.pending_count),
        completedCount: parseInt(row.completed_count)
      })),
      standaloneTodos: {
        pending: parseInt(standaloneTodos[0]?.pending || '0'),
        completed: parseInt(standaloneTodos[0]?.completed || '0')
      },
      streak: {
        currentStreak: parseInt(streakData[0]?.current_streak || '0')
      }
    }

    return successResponse(stats)
  } catch (error: any) {
    console.error('[API] GET /api/todos/stats error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get todo statistics',
      500,
      error.message
    )
  }
}
