import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { CalendarEvent } from '@/lib/types'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    isAllDay: row.is_all_day,
    timezone: row.timezone,
    source: row.source,
    sourceId: row.source_id,
    sourceMetadata: row.source_metadata || {},
    isRecurring: row.is_recurring,
    recurrenceRule: row.recurrence_rule,
    recurrenceParentId: row.recurrence_parent_id,
    recurrenceIndex: row.recurrence_index,
    locationName: row.location_name,
    locationAddress: row.location_address,
    locationLat: row.location_lat ? parseFloat(row.location_lat) : null,
    locationLng: row.location_lng ? parseFloat(row.location_lng) : null,
    locationUrl: row.location_url,
    attendees: row.attendees || [],
    reminders: row.reminders || [{ type: 'notification', minutes: 30 }],
    color: row.color,
    icon: row.icon,
    status: row.status,
    isPrivate: row.is_private,
    externalId: row.external_id,
    externalCalendar: row.external_calendar,
    categoryId: row.category_id,
    categoryName: row.category_name,
    tags: row.tags || [],
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/calendar
 * List calendar events with optional filters
 *
 * Query params:
 * - startDate: ISO date string (required for range query)
 * - endDate: ISO date string (required for range query)
 * - source: manual | todo | project | travel | external | finance | idea
 * - categoryId: UUID
 * - search: text search in title/description
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const source = searchParams.get('source')
    const categoryId = searchParams.get('categoryId')
    const search = searchParams.get('search')

    // Build query
    const events = await sql`
      SELECT
        e.*,
        c.name as category_name
      FROM calendar_events e
      LEFT JOIN calendar_categories c ON e.category_id = c.id
      WHERE e.user_id = ${userId}
        AND e.deleted_at IS NULL
        ${startDate ? sql`AND e.start_time >= ${startDate}::timestamptz` : sql``}
        ${endDate ? sql`AND e.start_time <= ${endDate}::timestamptz` : sql``}
        ${source ? sql`AND e.source = ${source}` : sql``}
        ${categoryId ? sql`AND e.category_id = ${categoryId}` : sql``}
        ${search ? sql`AND (e.title ILIKE ${'%' + search + '%'} OR e.description ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY e.start_time ASC, e.created_at DESC
    `

    return successResponse(events.map(transformEvent), {
      total: events.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/calendar error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get calendar events', 500, error.message)
  }
}

/**
 * POST /api/calendar
 * Create a new calendar event
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
      title,
      description,
      startTime,
      endTime,
      isAllDay,
      timezone,
      source,
      sourceId,
      sourceMetadata,
      isRecurring,
      recurrenceRule,
      locationName,
      locationAddress,
      locationLat,
      locationLng,
      locationUrl,
      attendees,
      reminders,
      color,
      icon,
      status,
      isPrivate,
      categoryId,
      tags,
      metadata
    } = body

    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Event title is required', 400)
    }
    if (!startTime) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Start time is required', 400)
    }

    // Build 5W+H envelope (legacy mode, non-fatal: calendar events are user-scoped, project optional)
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: undefined, agentId: undefined },
      {
        type: 'calendar_event',
        title: title?.trim(),
        summary: description || title?.trim(),
        rationale: body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    const hasEnvelope = envelopeResult.ok

    const result = await sql`
      INSERT INTO calendar_events (
        user_id, title, description, start_time, end_time, is_all_day,
        timezone, source, source_id, source_metadata, is_recurring,
        recurrence_rule, location_name, location_address, location_lat,
        location_lng, location_url, attendees, reminders, color, icon,
        status, is_private, category_id, tags, metadata, documentation_5wh
      ) VALUES (
        ${userId},
        ${title.trim()},
        ${description || null},
        ${startTime},
        ${endTime || null},
        ${isAllDay || false},
        ${timezone || 'UTC'},
        ${source || 'manual'},
        ${sourceId || null},
        ${sourceMetadata ? JSON.stringify(sourceMetadata) : '{}'},
        ${isRecurring || false},
        ${recurrenceRule ? JSON.stringify(recurrenceRule) : null},
        ${locationName || null},
        ${locationAddress || null},
        ${locationLat || null},
        ${locationLng || null},
        ${locationUrl || null},
        ${attendees ? JSON.stringify(attendees) : '[]'},
        ${reminders ? JSON.stringify(reminders) : '[{"type": "notification", "minutes": 30}]'},
        ${color || null},
        ${icon || null},
        ${status || 'confirmed'},
        ${isPrivate || false},
        ${categoryId || null},
        ${tags || []},
        ${metadata ? JSON.stringify(metadata) : '{}'},
        ${hasEnvelope ? envelopeForSql(envelopeResult.envelope) : null}::jsonb
      )
      RETURNING *
    `

    // Fetch with category name
    const created = await sql`
      SELECT e.*, c.name as category_name
      FROM calendar_events e
      LEFT JOIN calendar_categories c ON e.category_id = c.id
      WHERE e.id = ${result[0].id}
    `

    return successResponse(transformEvent(created[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/calendar error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create calendar event', 500, error.message)
  }
}
