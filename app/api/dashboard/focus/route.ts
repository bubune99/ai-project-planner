import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/focus
 * Get today's focus items - prioritized tasks and actions across all domains
 *
 * Returns:
 * - Overdue todos (highest priority)
 * - Todos due today
 * - Blocked project steps that need attention
 * - Ideas ready for validation
 * - Upcoming milestones this week
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Get overdue todos
    const overdueTodos = await sql`
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.due_date,
        t.project_id,
        p.name as project_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ${userId}
        AND t.deleted_at IS NULL
        AND t.status != 'completed'
        AND t.due_date < CURRENT_DATE
      ORDER BY t.due_date ASC, t.priority DESC
      LIMIT 5
    `

    // Get todos due today
    const todayTodos = await sql`
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.due_date,
        t.project_id,
        p.name as project_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ${userId}
        AND t.deleted_at IS NULL
        AND t.status != 'completed'
        AND t.due_date::date = CURRENT_DATE
      ORDER BY t.priority DESC, t.order_index ASC
      LIMIT 10
    `

    // Get blocked steps that need attention
    const blockedSteps = await sql`
      SELECT
        ps.id,
        ps.title,
        ps.description,
        ps.project_id,
        p.name as project_name,
        ps.updated_at
      FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
        AND ps.status = 'blocked'
      ORDER BY ps.updated_at DESC
      LIMIT 5
    `

    // Get ideas ready for validation (refined but not promoted)
    const ideasToValidate = await sql`
      SELECT
        i.id,
        i.title,
        i.lifecycle,
        i.category,
        (SELECT COUNT(*) FROM idea_validations v WHERE v.idea_id = i.id) as validation_count
      FROM ideas i
      WHERE i.user_id = ${userId}
        AND i.deleted_at IS NULL
        AND i.lifecycle IN ('exploring', 'refined')
        AND i.promoted_to_project_id IS NULL
      ORDER BY i.updated_at DESC
      LIMIT 3
    `

    // Get milestones due this week
    const upcomingMilestones = await sql`
      SELECT
        m.id,
        m.title,
        m.target_date,
        m.status,
        m.project_id,
        p.name as project_name
      FROM mlp_when_milestones m
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.user_id = ${userId}
        AND m.status = 'pending'
        AND m.target_date >= CURRENT_DATE
        AND m.target_date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY m.target_date ASC
      LIMIT 5
    `

    // Get high-priority active project steps
    const activeSteps = await sql`
      SELECT
        ps.id,
        ps.title,
        ps.project_id,
        p.name as project_name,
        ps.status,
        ps.priority
      FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
        AND p.status = 'in-progress'
        AND ps.status = 'in-progress'
      ORDER BY
        CASE ps.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        ps.updated_at DESC
      LIMIT 5
    `

    return successResponse({
      overdue: overdueTodos.map(t => ({
        id: t.id,
        type: 'todo',
        title: t.title,
        description: t.description,
        priority: t.priority,
        dueDate: t.due_date,
        project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
        urgency: 'overdue'
      })),
      today: todayTodos.map(t => ({
        id: t.id,
        type: 'todo',
        title: t.title,
        description: t.description,
        priority: t.priority,
        dueDate: t.due_date,
        project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
        urgency: 'today'
      })),
      blocked: blockedSteps.map(s => ({
        id: s.id,
        type: 'step',
        title: s.title,
        description: s.description,
        project: { id: s.project_id, name: s.project_name },
        urgency: 'blocked'
      })),
      ideasToReview: ideasToValidate.map(i => ({
        id: i.id,
        type: 'idea',
        title: i.title,
        lifecycle: i.lifecycle,
        category: i.category,
        validationCount: parseInt(i.validation_count || '0'),
        urgency: 'review'
      })),
      milestones: upcomingMilestones.map(m => ({
        id: m.id,
        type: 'milestone',
        title: m.title,
        targetDate: m.target_date,
        status: m.status,
        project: m.project_id ? { id: m.project_id, name: m.project_name } : null,
        urgency: 'upcoming'
      })),
      activeWork: activeSteps.map(s => ({
        id: s.id,
        type: 'step',
        title: s.title,
        priority: s.priority,
        status: s.status,
        project: { id: s.project_id, name: s.project_name },
        urgency: 'in-progress'
      })),
      summary: {
        overdueCount: overdueTodos.length,
        todayCount: todayTodos.length,
        blockedCount: blockedSteps.length,
        ideasToReviewCount: ideasToValidate.length,
        milestonesThisWeek: upcomingMilestones.length,
        activeWorkCount: activeSteps.length
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/dashboard/focus error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get focus items',
      500,
      error.message
    )
  }
}
