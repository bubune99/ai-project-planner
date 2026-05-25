import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { isValidFrequency } from '@/lib/service-schedule'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export interface ServiceSchedule {
  id: string
  userId: string
  clientId: string
  clientName: string | null
  projectId: string | null
  projectName: string | null
  sopId: string | null
  sopTitle: string | null
  title: string
  description: string | null
  frequency: string
  nextOccurrence: string
  lastPerformedAt: string | null
  endDate: string | null
  amount: number | null
  currency: string
  isActive: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function transformSchedule(row: any): ServiceSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    clientName: row.client_name ?? null,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    sopId: row.sop_id,
    sopTitle: row.sop_title ?? null,
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

async function ownedClient(id: string, userId: string) {
  const rows = await sql`
    SELECT 1 FROM clients WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return rows.length > 0
}

/**
 * GET /api/service-schedules
 * Query params: ?clientId=<uuid> ?projectId=<uuid> ?dueWithin=<days> ?activeOnly=1
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const projectId = searchParams.get('projectId')
    const dueWithinRaw = searchParams.get('dueWithin')
    const activeOnly = searchParams.get('activeOnly') === '1'
    const dueWithin = dueWithinRaw != null && /^\d+$/.test(dueWithinRaw) ? parseInt(dueWithinRaw, 10) : null

    const rows = await sql`
      SELECT s.*, c.name AS client_name, p.name AS project_name, sop.title AS sop_title
      FROM service_schedules s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN projects p ON s.project_id = p.id
      LEFT JOIN sops sop ON s.sop_id = sop.id
      WHERE s.user_id = ${userId}
        AND s.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND (${clientId}::uuid IS NULL OR s.client_id = ${clientId})
        AND (${projectId}::uuid IS NULL OR s.project_id = ${projectId})
        AND (${activeOnly} = false OR s.is_active = true)
        AND (${dueWithin}::int IS NULL
             OR s.next_occurrence <= (CURRENT_DATE + (${dueWithin} || ' days')::interval))
      ORDER BY s.is_active DESC, s.next_occurrence ASC
    `

    const schedules = rows.map(transformSchedule)
    const today = new Date().toISOString().slice(0, 10)
    const meta = {
      total: schedules.length,
      overdue: schedules.filter(s => s.isActive && s.nextOccurrence < today).length,
      dueSoon: schedules.filter(s => s.isActive && s.nextOccurrence >= today).length,
    }
    return successResponse(schedules, meta as any)
  } catch (error) {
    console.error('GET /api/service-schedules error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load service schedules', 500)
  }
}

/**
 * POST /api/service-schedules
 * Body: { clientId (required), title (required), frequency?, nextOccurrence (required, YYYY-MM-DD),
 *         description?, projectId?, sopId?, amount?, currency?, endDate? }
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
      clientId, title, frequency, nextOccurrence, description,
      projectId, sopId, amount, currency, endDate,
    } = body

    if (!clientId) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'clientId is required', 400)
    if (!title?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    if (!nextOccurrence) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'nextOccurrence date is required', 400)
    const safeFrequency = isValidFrequency(frequency) ? frequency : 'monthly'

    if (!(await ownedClient(clientId, userId))) {
      return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this client', 403)
    }
    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this project', 403)
      }
    }

    // Build 5W+H envelope (legacy mode). Service schedules are linked to a client, optionally to a project.
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: projectId || undefined, agentId: undefined },
      {
        type: 'service_schedule',
        title: title?.trim(),
        summary: description?.trim() || title?.trim(),
        rationale: body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    // Non-fatal: store without envelope if project_id is missing (client-only schedules)
    const hasEnvelope = envelopeResult.ok

    const result = await sql`
      INSERT INTO service_schedules
        (user_id, client_id, project_id, sop_id, title, description, frequency, next_occurrence, end_date, amount, currency, documentation_5wh)
      VALUES (
        ${userId},
        ${clientId},
        ${projectId || null},
        ${sopId || null},
        ${title.trim()},
        ${description?.trim() || null},
        ${safeFrequency},
        ${nextOccurrence},
        ${endDate || null},
        ${amount != null && amount !== '' ? amount : null},
        ${(currency || 'USD').toUpperCase().slice(0, 3)},
        ${hasEnvelope ? envelopeForSql(envelopeResult.envelope) : null}::jsonb
      )
      RETURNING *
    `
    return successResponse(transformSchedule(result[0]), undefined, 201)
  } catch (error) {
    console.error('POST /api/service-schedules error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create service schedule', 500)
  }
}
