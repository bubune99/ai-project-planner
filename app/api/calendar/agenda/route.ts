import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { CalendarAgendaItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/calendar/agenda
 * Aggregated view combining:
 * - Calendar events
 * - Todos with due dates
 * - Project milestones (from memory_when_events)
 * - Upcoming bills (from finance_recurring_transactions)
 *
 * Query params:
 * - startDate: ISO date string (default: today)
 * - endDate: ISO date string (default: +30 days)
 * - types: comma-separated list of types to include (event,todo,milestone,bill)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    // Default to today through next 30 days
    const now = new Date()
    const defaultStart = now.toISOString()
    const defaultEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const startDate = searchParams.get('startDate') || defaultStart
    const endDate = searchParams.get('endDate') || defaultEnd
    const typesParam = searchParams.get('types')
    const types = typesParam ? typesParam.split(',') : ['event', 'todo', 'milestone', 'bill']

    const agendaItems: CalendarAgendaItem[] = []

    // 1. Calendar Events
    if (types.includes('event')) {
      const events = await sql`
        SELECT
          id,
          title,
          description,
          start_time,
          end_time,
          is_all_day,
          source,
          source_id,
          color,
          icon,
          status,
          metadata
        FROM calendar_events
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND start_time >= ${startDate}::timestamptz
          AND start_time <= ${endDate}::timestamptz
        ORDER BY start_time ASC
      `

      for (const e of events) {
        agendaItems.push({
          id: e.id,
          type: 'event',
          title: e.title,
          description: e.description,
          startTime: e.start_time,
          endTime: e.end_time,
          isAllDay: e.is_all_day,
          source: e.source,
          sourceId: e.source_id,
          color: e.color,
          icon: e.icon || 'calendar',
          status: e.status,
          metadata: e.metadata || {}
        })
      }
    }

    // 2. Todos with due dates
    if (types.includes('todo')) {
      const todos = await sql`
        SELECT
          id,
          title,
          description,
          due_date,
          status,
          priority,
          metadata
        FROM todos
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND due_date IS NOT NULL
          AND due_date >= ${startDate}::date
          AND due_date <= ${endDate}::date
          AND status != 'completed'
        ORDER BY due_date ASC
      `

      for (const t of todos) {
        agendaItems.push({
          id: t.id,
          type: 'todo',
          title: t.title,
          description: t.description,
          startTime: t.due_date,
          endTime: null,
          isAllDay: true,
          source: 'todo',
          sourceId: t.id,
          color: t.priority === 'urgent' ? '#ef4444' : t.priority === 'high' ? '#f97316' : '#3b82f6',
          icon: 'check-square',
          status: t.status,
          metadata: { priority: t.priority, ...t.metadata }
        })
      }
    }

    // 3. Project Milestones (from memory_when_events if table exists)
    if (types.includes('milestone')) {
      try {
        const milestones = await sql`
          SELECT
            id,
            title,
            description,
            target_date,
            status,
            milestone_type,
            project_id,
            idea_id
          FROM memory_when_events
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
            AND target_date IS NOT NULL
            AND target_date >= ${startDate}::date
            AND target_date <= ${endDate}::date
            AND status IN ('pending', 'achieved')
          ORDER BY target_date ASC
        `

        for (const m of milestones) {
          agendaItems.push({
            id: m.id,
            type: 'milestone',
            title: m.title,
            description: m.description,
            startTime: m.target_date,
            endTime: null,
            isAllDay: true,
            source: 'project',
            sourceId: m.project_id || m.idea_id,
            color: m.status === 'achieved' ? '#22c55e' : '#8b5cf6',
            icon: 'flag',
            status: m.status,
            metadata: { milestoneType: m.milestone_type, projectId: m.project_id, ideaId: m.idea_id }
          })
        }
      } catch {
        // Table may not exist yet, skip silently
      }
    }

    // 4. Upcoming Bills (from finance_recurring_transactions)
    if (types.includes('bill')) {
      try {
        const bills = await sql`
          SELECT
            r.id,
            r.description,
            r.merchant,
            r.amount,
            r.currency,
            r.next_occurrence,
            r.transaction_type,
            c.name as category_name,
            c.icon as category_icon,
            c.color as category_color
          FROM finance_recurring_transactions r
          LEFT JOIN finance_categories c ON r.category_id = c.id
          WHERE r.user_id = ${userId}
            AND r.is_active = true
            AND r.transaction_type = 'expense'
            AND r.next_occurrence >= ${startDate}::date
            AND r.next_occurrence <= ${endDate}::date
          ORDER BY r.next_occurrence ASC
        `

        for (const b of bills) {
          agendaItems.push({
            id: b.id,
            type: 'bill',
            title: b.merchant || b.description || 'Recurring Bill',
            description: `${b.currency} ${parseFloat(b.amount).toFixed(2)} - ${b.category_name || 'Uncategorized'}`,
            startTime: b.next_occurrence,
            endTime: null,
            isAllDay: true,
            source: 'finance',
            sourceId: b.id,
            color: b.category_color || '#ef4444',
            icon: b.category_icon || 'credit-card',
            status: 'upcoming',
            metadata: { amount: parseFloat(b.amount), currency: b.currency, category: b.category_name }
          })
        }
      } catch {
        // Table may not exist yet, skip silently
      }
    }

    // Sort all items by start time
    agendaItems.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Group by date for easier rendering
    const groupedByDate: Record<string, CalendarAgendaItem[]> = {}
    for (const item of agendaItems) {
      const dateKey = new Date(item.startTime).toISOString().split('T')[0]
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = []
      }
      groupedByDate[dateKey].push(item)
    }

    return successResponse(agendaItems, {
      total: agendaItems.length,
      groupedByDate,
      counts: {
        events: agendaItems.filter(i => i.type === 'event').length,
        todos: agendaItems.filter(i => i.type === 'todo').length,
        milestones: agendaItems.filter(i => i.type === 'milestone').length,
        bills: agendaItems.filter(i => i.type === 'bill').length
      },
      dateRange: {
        start: startDate,
        end: endDate
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/calendar/agenda error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get agenda', 500, error.message)
  }
}
