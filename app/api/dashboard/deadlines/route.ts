import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

interface DeadlineItem {
  id: string
  type: 'todo' | 'milestone' | 'step'
  title: string
  dueDate: Date
  priority?: string
  status: string
  project?: { id: string; name: string } | null
  daysUntilDue: number
  urgency: 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'later'
}

/**
 * GET /api/dashboard/deadlines
 * Get upcoming deadlines across all domains for dashboard widget
 *
 * Query params:
 * - days: number (default 14) - how many days ahead to look
 * - includeOverdue: boolean (default true)
 * - types: string (comma-separated: todo,milestone,step)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const days = Math.min(parseInt(searchParams.get('days') || '14'), 90)
    const includeOverdue = searchParams.get('includeOverdue') !== 'false'
    const typesParam = searchParams.get('types')
    const types = typesParam
      ? typesParam.split(',').map(t => t.trim())
      : ['todo', 'milestone', 'step']

    const deadlines: DeadlineItem[] = []

    // Get todo deadlines
    if (types.includes('todo')) {
      const todoDeadlines = await sql`
        SELECT
          t.id,
          t.title,
          t.due_date,
          t.priority,
          t.status,
          t.project_id,
          p.name as project_name,
          (t.due_date::date - CURRENT_DATE) as days_until
        FROM todos t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.user_id = ${userId}
          AND t.deleted_at IS NULL
          AND t.status != 'completed'
          AND t.due_date IS NOT NULL
          AND (
            ${includeOverdue ? sql`t.due_date < CURRENT_DATE OR` : sql``}
            t.due_date <= CURRENT_DATE + ${days}::integer
          )
        ORDER BY t.due_date ASC
        LIMIT 20
      `

      todoDeadlines.forEach(t => {
        const daysUntil = parseInt(t.days_until)
        deadlines.push({
          id: t.id,
          type: 'todo',
          title: t.title,
          dueDate: t.due_date,
          priority: t.priority,
          status: t.status,
          project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
          daysUntilDue: daysUntil,
          urgency: getUrgency(daysUntil)
        })
      })
    }

    // Get milestone deadlines
    if (types.includes('milestone')) {
      const milestoneDeadlines = await sql`
        SELECT
          m.id,
          m.title,
          m.target_date as due_date,
          m.status,
          m.project_id,
          p.name as project_name,
          (m.target_date::date - CURRENT_DATE) as days_until
        FROM mlp_when_milestones m
        LEFT JOIN projects p ON m.project_id = p.id
        WHERE m.user_id = ${userId}
          AND m.status = 'pending'
          AND m.target_date IS NOT NULL
          AND (
            ${includeOverdue ? sql`m.target_date < CURRENT_DATE OR` : sql``}
            m.target_date <= CURRENT_DATE + ${days}::integer
          )
        ORDER BY m.target_date ASC
        LIMIT 10
      `

      milestoneDeadlines.forEach(m => {
        const daysUntil = parseInt(m.days_until)
        deadlines.push({
          id: m.id,
          type: 'milestone',
          title: m.title,
          dueDate: m.due_date,
          status: m.status,
          project: m.project_id ? { id: m.project_id, name: m.project_name } : null,
          daysUntilDue: daysUntil,
          urgency: getUrgency(daysUntil)
        })
      })
    }

    // Get project step deadlines (if steps have due dates)
    if (types.includes('step')) {
      const stepDeadlines = await sql`
        SELECT
          ps.id,
          ps.title,
          ps.due_date,
          ps.priority,
          ps.status,
          ps.project_id,
          p.name as project_name,
          (ps.due_date::date - CURRENT_DATE) as days_until
        FROM project_steps ps
        JOIN projects p ON ps.project_id = p.id
        WHERE p.user_id = ${userId}
          AND p.deleted_at IS NULL
          AND ps.status NOT IN ('completed', 'skipped')
          AND ps.due_date IS NOT NULL
          AND (
            ${includeOverdue ? sql`ps.due_date < CURRENT_DATE OR` : sql``}
            ps.due_date <= CURRENT_DATE + ${days}::integer
          )
        ORDER BY ps.due_date ASC
        LIMIT 10
      `

      stepDeadlines.forEach(s => {
        const daysUntil = parseInt(s.days_until)
        deadlines.push({
          id: s.id,
          type: 'step',
          title: s.title,
          dueDate: s.due_date,
          priority: s.priority,
          status: s.status,
          project: { id: s.project_id, name: s.project_name },
          daysUntilDue: daysUntil,
          urgency: getUrgency(daysUntil)
        })
      })
    }

    // Sort all deadlines by date
    deadlines.sort((a, b) => a.daysUntilDue - b.daysUntilDue)

    // Group by urgency for summary
    const byUrgency = {
      overdue: deadlines.filter(d => d.urgency === 'overdue'),
      today: deadlines.filter(d => d.urgency === 'today'),
      tomorrow: deadlines.filter(d => d.urgency === 'tomorrow'),
      thisWeek: deadlines.filter(d => d.urgency === 'this_week'),
      nextWeek: deadlines.filter(d => d.urgency === 'next_week'),
      later: deadlines.filter(d => d.urgency === 'later')
    }

    return successResponse({
      deadlines: deadlines.slice(0, 30), // Limit total results
      byUrgency,
      summary: {
        total: deadlines.length,
        overdueCount: byUrgency.overdue.length,
        todayCount: byUrgency.today.length,
        tomorrowCount: byUrgency.tomorrow.length,
        thisWeekCount: byUrgency.thisWeek.length,
        nextWeekCount: byUrgency.nextWeek.length
      }
    }, {
      daysAhead: days,
      includeOverdue,
      types
    })
  } catch (error: any) {
    console.error('[API] GET /api/dashboard/deadlines error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get deadlines',
      500,
      error.message
    )
  }
}

function getUrgency(daysUntil: number): DeadlineItem['urgency'] {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  if (daysUntil <= 7) return 'this_week'
  if (daysUntil <= 14) return 'next_week'
  return 'later'
}
