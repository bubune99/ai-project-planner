import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform event row to frontend format
 */
function transformEvent(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    ideaId: row.idea_id,
    eventType: row.event_type,
    description: row.description,
    affectedComponents: row.affected_components || [],
    significanceScore: row.significance_score,
    eventData: row.event_data || {},
    timestamp: row.timestamp
  }
}

/**
 * Transform milestone row to frontend format
 */
function transformMilestone(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    ideaId: row.idea_id,
    title: row.title,
    description: row.description,
    milestoneType: row.milestone_type,
    status: row.status,
    targetDate: row.target_date,
    achievedDate: row.achieved_date,
    impact: row.impact,
    deliverables: row.deliverables || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/memory/when
 * Get timeline data - events and milestones
 *
 * Query params:
 * - projectId: UUID (filter by project)
 * - ideaId: UUID (filter by idea)
 * - type: "events" | "milestones" | "all" (default: "all")
 * - eventType: string (filter events by type)
 * - milestoneStatus: "pending" | "achieved" | "missed" | "cancelled"
 * - from: ISO date (start of range)
 * - to: ISO date (end of range)
 * - limit: number (default 50)
 * - offset: number (pagination)
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
    const ideaId = searchParams.get('ideaId')
    const type = searchParams.get('type') || 'all'
    const eventType = searchParams.get('eventType')
    const milestoneStatus = searchParams.get('milestoneStatus')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const result: { events?: any[], milestones?: any[] } = {}

    // Get events
    if (type === 'all' || type === 'events') {
      const events = await sql`
        SELECT * FROM mlp_when_events
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          ${eventType ? sql`AND event_type = ${eventType}` : sql``}
          ${from ? sql`AND timestamp >= ${from}::timestamptz` : sql``}
          ${to ? sql`AND timestamp <= ${to}::timestamptz` : sql``}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      result.events = events.map(transformEvent)
    }

    // Get milestones
    if (type === 'all' || type === 'milestones') {
      const milestones = await sql`
        SELECT * FROM mlp_when_milestones
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          ${milestoneStatus ? sql`AND status = ${milestoneStatus}` : sql``}
          ${from ? sql`AND (target_date >= ${from}::date OR achieved_date >= ${from}::date)` : sql``}
          ${to ? sql`AND (target_date <= ${to}::date OR achieved_date <= ${to}::date)` : sql``}
        ORDER BY COALESCE(target_date, achieved_date) DESC NULLS LAST
        LIMIT ${limit}
        OFFSET ${offset}
      `
      result.milestones = milestones.map(transformMilestone)
    }

    // Get counts
    const eventCount = await sql`
      SELECT COUNT(*) as count FROM mlp_when_events
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
    `
    const milestoneCount = await sql`
      SELECT COUNT(*) as count FROM mlp_when_milestones
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
    `

    return successResponse(result, {
      totals: {
        events: parseInt(eventCount[0]?.count || '0'),
        milestones: parseInt(milestoneCount[0]?.count || '0')
      },
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/when error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get timeline data',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/when
 * Create an event or milestone
 *
 * Body: {
 *   recordType: "event" | "milestone" (required)
 *
 *   // For events:
 *   eventType?: string
 *   description?: string
 *   affectedComponents?: string[]
 *   significanceScore?: number (0-100)
 *   eventData?: object
 *
 *   // For milestones:
 *   title?: string (required for milestones)
 *   milestoneType?: string
 *   targetDate?: ISO date
 *   impact?: string
 *   deliverables?: array
 *
 *   // Common:
 *   projectId?: UUID
 *   ideaId?: UUID
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()

    const { recordType, projectId, ideaId } = body

    // Verify project access if projectId provided
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'No access to this project', 403)
      }
    }

    if (recordType === 'event') {
      const {
        eventType,
        description,
        affectedComponents,
        significanceScore,
        eventData
      } = body

      if (!eventType?.trim()) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Event type is required', 400)
      }

      // Validate significance score if provided
      if (significanceScore !== undefined && (significanceScore < 0 || significanceScore > 100)) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Significance score must be between 0 and 100', 400)
      }

      const result = await sql`
        INSERT INTO mlp_when_events (
          user_id,
          project_id,
          idea_id,
          event_type,
          description,
          affected_components,
          significance_score,
          event_data
        ) VALUES (
          ${userId},
          ${projectId || null},
          ${ideaId || null},
          ${eventType.trim()},
          ${description?.trim() || null},
          ${affectedComponents || []},
          ${significanceScore || null},
          ${eventData ? JSON.stringify(eventData) : '{}'}
        )
        RETURNING *
      `

      return successResponse(transformEvent(result[0]), undefined, 201)
    }

    if (recordType === 'milestone') {
      const {
        title,
        description,
        milestoneType,
        targetDate,
        impact,
        deliverables
      } = body

      if (!title?.trim()) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required for milestones', 400)
      }
      if (!milestoneType?.trim()) {
        return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Milestone type is required', 400)
      }

      const result = await sql`
        INSERT INTO mlp_when_milestones (
          user_id,
          project_id,
          idea_id,
          title,
          description,
          milestone_type,
          target_date,
          impact,
          deliverables
        ) VALUES (
          ${userId},
          ${projectId || null},
          ${ideaId || null},
          ${title.trim()},
          ${description?.trim() || null},
          ${milestoneType.trim()},
          ${targetDate || null},
          ${impact?.trim() || null},
          ${deliverables ? JSON.stringify(deliverables) : '[]'}
        )
        RETURNING *
      `

      return successResponse(transformMilestone(result[0]), undefined, 201)
    }

    return errorResponse(
      ErrorCodes.VALIDATION_ERROR,
      'recordType must be "event" or "milestone"',
      400
    )
  } catch (error: any) {
    console.error('[API] POST /api/memory/when error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create record',
      500,
      error.message
    )
  }
}
