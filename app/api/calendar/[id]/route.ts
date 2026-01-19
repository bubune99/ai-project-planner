import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { CalendarEvent } from '@/lib/types'

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
 * GET /api/calendar/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    const events = await sql`
      SELECT e.*, c.name as category_name
      FROM calendar_events e
      LEFT JOIN calendar_categories c ON e.category_id = c.id
      WHERE e.id = ${id} AND e.user_id = ${userId} AND e.deleted_at IS NULL
    `

    if (events.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Calendar event not found', 404)
    }

    return successResponse(transformEvent(events[0]))
  } catch (error: any) {
    console.error('[API] GET /api/calendar/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get calendar event', 500, error.message)
  }
}

/**
 * PATCH /api/calendar/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    const body = await request.json()

    // Verify ownership
    const existing = await sql`
      SELECT * FROM calendar_events
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Calendar event not found', 404)
    }

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

    await sql`
      UPDATE calendar_events SET
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        start_time = COALESCE(${startTime}, start_time),
        end_time = COALESCE(${endTime}, end_time),
        is_all_day = COALESCE(${isAllDay}, is_all_day),
        timezone = COALESCE(${timezone}, timezone),
        source = COALESCE(${source}, source),
        source_id = COALESCE(${sourceId}, source_id),
        source_metadata = COALESCE(${sourceMetadata ? JSON.stringify(sourceMetadata) : null}::jsonb, source_metadata),
        is_recurring = COALESCE(${isRecurring}, is_recurring),
        recurrence_rule = COALESCE(${recurrenceRule ? JSON.stringify(recurrenceRule) : null}::jsonb, recurrence_rule),
        location_name = COALESCE(${locationName}, location_name),
        location_address = COALESCE(${locationAddress}, location_address),
        location_lat = COALESCE(${locationLat}, location_lat),
        location_lng = COALESCE(${locationLng}, location_lng),
        location_url = COALESCE(${locationUrl}, location_url),
        attendees = COALESCE(${attendees ? JSON.stringify(attendees) : null}::jsonb, attendees),
        reminders = COALESCE(${reminders ? JSON.stringify(reminders) : null}::jsonb, reminders),
        color = COALESCE(${color}, color),
        icon = COALESCE(${icon}, icon),
        status = COALESCE(${status}, status),
        is_private = COALESCE(${isPrivate}, is_private),
        category_id = COALESCE(${categoryId}, category_id),
        tags = COALESCE(${tags}, tags),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
    `

    // Fetch updated with category name
    const updated = await sql`
      SELECT e.*, c.name as category_name
      FROM calendar_events e
      LEFT JOIN calendar_categories c ON e.category_id = c.id
      WHERE e.id = ${id}
    `

    return successResponse(transformEvent(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/calendar/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update calendar event', 500, error.message)
  }
}

/**
 * DELETE /api/calendar/[id]
 * Soft delete a calendar event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params

    const result = await sql`
      UPDATE calendar_events
      SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Calendar event not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/calendar/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete calendar event', 500, error.message)
  }
}
