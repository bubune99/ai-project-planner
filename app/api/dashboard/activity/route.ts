import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

interface ActivityItem {
  id: string
  type: 'project' | 'idea' | 'todo' | 'transaction' | 'decision' | 'milestone'
  action: string
  title: string
  description: string | null
  entityId: string
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * GET /api/dashboard/activity
 * Get recent activity feed across all domains
 *
 * Query params:
 * - limit: number (default 20, max 50)
 * - types: string (comma-separated: project,idea,todo,transaction,decision,milestone)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const typesParam = searchParams.get('types')
    const types = typesParam
      ? typesParam.split(',').map(t => t.trim())
      : ['project', 'idea', 'todo', 'transaction', 'decision', 'milestone']

    const activities: ActivityItem[] = []

    // Get recent project updates
    if (types.includes('project')) {
      const projectActivity = await sql`
        SELECT
          id,
          name as title,
          status,
          updated_at as timestamp,
          created_at
        FROM projects
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT ${Math.ceil(limit / 3)}
      `

      projectActivity.forEach(p => {
        const isNew = new Date(p.created_at).getTime() === new Date(p.updated_at).getTime()
        activities.push({
          id: `project-${p.id}`,
          type: 'project',
          action: isNew ? 'created' : 'updated',
          title: p.title,
          description: `Project ${isNew ? 'created' : 'updated'} - Status: ${p.status}`,
          entityId: p.id,
          timestamp: p.timestamp,
          metadata: { status: p.status }
        })
      })
    }

    // Get recent idea updates
    if (types.includes('idea')) {
      const ideaActivity = await sql`
        SELECT
          id,
          title,
          lifecycle,
          updated_at as timestamp,
          created_at
        FROM ideas
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT ${Math.ceil(limit / 3)}
      `

      ideaActivity.forEach(i => {
        const isNew = new Date(i.created_at).getTime() === new Date(i.updated_at).getTime()
        activities.push({
          id: `idea-${i.id}`,
          type: 'idea',
          action: isNew ? 'created' : 'updated',
          title: i.title,
          description: `Idea ${isNew ? 'captured' : 'updated'} - Stage: ${i.lifecycle}`,
          entityId: i.id,
          timestamp: i.timestamp,
          metadata: { lifecycle: i.lifecycle }
        })
      })
    }

    // Get recent todo completions and updates
    if (types.includes('todo')) {
      const todoActivity = await sql`
        SELECT
          id,
          title,
          status,
          completed_at,
          updated_at as timestamp,
          created_at
        FROM todos
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
        ORDER BY GREATEST(updated_at, COALESCE(completed_at, '1970-01-01')) DESC
        LIMIT ${Math.ceil(limit / 3)}
      `

      todoActivity.forEach(t => {
        const isCompleted = t.status === 'completed'
        const isNew = new Date(t.created_at).getTime() === new Date(t.timestamp).getTime()
        activities.push({
          id: `todo-${t.id}`,
          type: 'todo',
          action: isCompleted ? 'completed' : (isNew ? 'created' : 'updated'),
          title: t.title,
          description: isCompleted ? 'Task completed' : (isNew ? 'Task created' : 'Task updated'),
          entityId: t.id,
          timestamp: isCompleted && t.completed_at ? t.completed_at : t.timestamp,
          metadata: { status: t.status }
        })
      })
    }

    // Get recent transactions
    if (types.includes('transaction')) {
      const transactionActivity = await sql`
        SELECT
          id,
          description as title,
          amount,
          type,
          category,
          date as timestamp
        FROM transactions
        WHERE user_id = ${userId}
        ORDER BY date DESC, created_at DESC
        LIMIT ${Math.ceil(limit / 4)}
      `

      transactionActivity.forEach(t => {
        activities.push({
          id: `transaction-${t.id}`,
          type: 'transaction',
          action: t.type === 'income' ? 'received' : 'spent',
          title: t.title || 'Transaction',
          description: `${t.type === 'income' ? '+' : '-'}$${Math.abs(parseFloat(t.amount)).toFixed(2)} - ${t.category || 'Uncategorized'}`,
          entityId: t.id,
          timestamp: t.timestamp,
          metadata: { amount: t.amount, type: t.type, category: t.category }
        })
      })
    }

    // Get recent decisions
    if (types.includes('decision')) {
      const decisionActivity = await sql`
        SELECT
          id,
          title,
          status,
          updated_at as timestamp,
          created_at
        FROM mlp_why_decisions
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT ${Math.ceil(limit / 4)}
      `

      decisionActivity.forEach(d => {
        const isNew = new Date(d.created_at).getTime() === new Date(d.timestamp).getTime()
        activities.push({
          id: `decision-${d.id}`,
          type: 'decision',
          action: isNew ? 'logged' : 'updated',
          title: d.title,
          description: `Decision ${isNew ? 'logged' : 'updated'} - Status: ${d.status}`,
          entityId: d.id,
          timestamp: d.timestamp,
          metadata: { status: d.status }
        })
      })
    }

    // Get recent milestones
    if (types.includes('milestone')) {
      const milestoneActivity = await sql`
        SELECT
          id,
          title,
          status,
          achieved_date,
          updated_at as timestamp
        FROM mlp_when_milestones
        WHERE user_id = ${userId}
        ORDER BY COALESCE(achieved_date, updated_at) DESC
        LIMIT ${Math.ceil(limit / 4)}
      `

      milestoneActivity.forEach(m => {
        const isAchieved = m.status === 'achieved'
        activities.push({
          id: `milestone-${m.id}`,
          type: 'milestone',
          action: isAchieved ? 'achieved' : 'updated',
          title: m.title,
          description: isAchieved ? 'Milestone achieved!' : `Milestone updated - Status: ${m.status}`,
          entityId: m.id,
          timestamp: isAchieved && m.achieved_date ? m.achieved_date : m.timestamp,
          metadata: { status: m.status }
        })
      })
    }

    // Sort all activities by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Return limited results
    const limitedActivities = activities.slice(0, limit)

    return successResponse(limitedActivities, {
      total: limitedActivities.length,
      types: types
    })
  } catch (error: any) {
    console.error('[API] GET /api/dashboard/activity error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get activity feed',
      500,
      error.message
    )
  }
}
