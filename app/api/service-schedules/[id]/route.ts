import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { advanceDate, isValidFrequency, type RecurringFrequency } from '@/lib/service-schedule'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformSchedule(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    projectId: row.project_id,
    sopId: row.sop_id,
    title: row.title,
    description: row.description,
    frequency: row.frequency,
    nextOccurrence: row.next_occurrence,
    lastPerformedAt: row.last_performed_at,
    endDate: row.end_date,
    amount: row.amount != null ? Number(row.amount) : null,
    currency: row.currency,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getOwned(id: string, userId: string) {
  const rows = await sql`
    SELECT * FROM service_schedules
    WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return rows[0] ?? null
}

/** GET /api/service-schedules/[id] */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const row = await getOwned(params.id, authContext.userId)
    if (!row) return errorResponse(ErrorCodes.NOT_FOUND, 'Service schedule not found', 404)
    return successResponse(transformSchedule(row))
  } catch (error) {
    console.error('GET /api/service-schedules/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load service schedule', 500)
  }
}

/**
 * PATCH /api/service-schedules/[id]
 * Body: either { action: 'perform' } to mark this occurrence done (advances
 * next_occurrence by frequency, stamps last_performed_at), or any editable
 * fields: { title, description, frequency, nextOccurrence, projectId, sopId,
 * amount, currency, endDate, isActive }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext
    const existing = await getOwned(params.id, userId)
    if (!existing) return errorResponse(ErrorCodes.NOT_FOUND, 'Service schedule not found', 404)

    const body = await request.json()

    // --- Mark performed: advance to the next occurrence ---
    if (body.action === 'perform') {
      const base = existing.next_occurrence ? new Date(existing.next_occurrence) : new Date()
      const freq = existing.frequency as RecurringFrequency
      let next = advanceDate(base, freq)
      // If catching up on an overdue item, keep advancing past today
      const today = new Date().toISOString().slice(0, 10)
      let guard = 0
      while (next <= today && guard < 60) {
        next = advanceDate(new Date(next), freq)
        guard++
      }
      const endDate: string | null = existing.end_date
      const stillActive = endDate ? next <= endDate : true
      const result = await sql`
        UPDATE service_schedules SET
          next_occurrence   = ${next},
          last_performed_at = NOW(),
          is_active         = ${stillActive},
          updated_at        = NOW()
        WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING *
      `
      return successResponse(transformSchedule(result[0]))
    }

    // --- Field edits ---
    const {
      title, description, frequency, nextOccurrence, projectId,
      sopId, amount, currency, endDate, isActive,
    } = body

    if (title !== undefined && !title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title cannot be empty', 400)
    }
    if (frequency !== undefined && !isValidFrequency(frequency)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid frequency', 400)
    }
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) return errorResponse(ErrorCodes.FORBIDDEN, 'No access to that project', 403)
    }

    // Merge 5W+H envelope
    const effectiveProjectId = (projectId !== undefined ? projectId : existing.project_id) ?? undefined
    const mergeResult = mergeEnvelopeForPatch(
      existing.documentation_5wh,
      body,
      { userId, projectId: effectiveProjectId, agentId: undefined },
      {
        type: 'service_schedule',
        title: title || undefined,
        summary: description || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/service-schedules/[id]',
      }
    )
    // Non-fatal: if no project_id, skip envelope update
    const hasEnvelope = mergeResult.ok

    const result = await sql`
      UPDATE service_schedules SET
        title             = COALESCE(${title?.trim() ?? null}, title),
        description       = COALESCE(${description !== undefined ? (description?.trim() || null) : null}, description),
        frequency         = COALESCE(${frequency ?? null}, frequency),
        next_occurrence   = COALESCE(${nextOccurrence ?? null}, next_occurrence),
        project_id        = COALESCE(${projectId !== undefined ? (projectId || null) : null}, project_id),
        sop_id            = COALESCE(${sopId !== undefined ? (sopId || null) : null}, sop_id),
        amount            = COALESCE(${amount !== undefined && amount !== '' ? amount : null}, amount),
        currency          = COALESCE(${currency ? String(currency).toUpperCase().slice(0, 3) : null}, currency),
        end_date          = COALESCE(${endDate !== undefined ? (endDate || null) : null}, end_date),
        is_active         = COALESCE(${typeof isActive === 'boolean' ? isActive : null}, is_active),
        documentation_5wh = COALESCE(${hasEnvelope ? envelopeForSql(mergeResult.envelope) : null}::jsonb, documentation_5wh),
        updated_at        = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Service schedule not found', 404)
    return successResponse(transformSchedule(result[0]))
  } catch (error) {
    console.error('PATCH /api/service-schedules/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update service schedule', 500)
  }
}

/** DELETE /api/service-schedules/[id] — soft delete */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const result = await sql`
      UPDATE service_schedules SET deleted_at = NOW(), is_active = false
      WHERE id = ${params.id} AND user_id = ${authContext.userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Service schedule not found', 404)
    return successResponse({ id: params.id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/service-schedules/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete service schedule', 500)
  }
}
