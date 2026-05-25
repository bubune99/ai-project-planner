import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

function transformClient(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    company: row.company,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    billingReference: row.billing_reference,
    notes: row.notes,
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

/** GET /api/clients/[id] — client + linked projects + service schedules */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext

    const rows = await sql`
      SELECT * FROM clients
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (rows.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Client not found', 404)

    const projects = await sql`
      SELECT id, name, status, current_phase, progress, health, project_type
      FROM projects
      WHERE client_id = ${params.id} AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `
    const schedules = await sql`
      SELECT s.*, sop.title AS sop_title, p.name AS project_name
      FROM service_schedules s
      LEFT JOIN sops sop ON s.sop_id = sop.id
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.client_id = ${params.id} AND s.deleted_at IS NULL
      ORDER BY s.is_active DESC, s.next_occurrence ASC
    `

    return successResponse({
      ...transformClient(rows[0]),
      projects: projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        phase: p.current_phase,
        progress: p.progress,
        health: p.health,
        projectType: p.project_type,
      })),
      schedules: schedules.map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        frequency: s.frequency,
        nextOccurrence: s.next_occurrence,
        lastPerformedAt: s.last_performed_at,
        endDate: s.end_date,
        amount: s.amount != null ? Number(s.amount) : null,
        currency: s.currency,
        isActive: s.is_active,
        projectId: s.project_id,
        projectName: s.project_name,
        sopId: s.sop_id,
        sopTitle: s.sop_title,
      })),
    })
  } catch (error) {
    console.error('GET /api/clients/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load client', 500)
  }
}

/** PATCH /api/clients/[id] — any of { name, company, contactEmail, contactPhone, status, billingReference, notes } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext
    if (!(await ownedClient(params.id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Client not found', 404)
    }
    const body = await request.json()
    const { name, company, contactEmail, contactPhone, status, billingReference, notes } = body

    if (name !== undefined && !name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Name cannot be empty', 400)
    }
    if (status !== undefined && !['active', 'paused', 'churned', 'prospect'].includes(status)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid status', 400)
    }

    // Fetch existing envelope for merge
    const existingClient = await sql`SELECT documentation_5wh FROM clients WHERE id = ${params.id} AND user_id = ${userId}`
    const mergeResult = mergeEnvelopeForPatch(
      existingClient[0]?.documentation_5wh,
      body,
      { userId, projectId: undefined, agentId: undefined },
      {
        type: 'client',
        title: name || undefined,
        summary: notes || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/clients/[id]',
      }
    )
    // Non-fatal: clients may have no project_id; if merge fails due to missing project_id, skip envelope
    const hasEnvelope = mergeResult.ok

    // COALESCE keeps the existing value when a field is omitted (passed null).
    const result = await sql`
      UPDATE clients SET
        name              = COALESCE(${name?.trim() ?? null}, name),
        company           = COALESCE(${company !== undefined ? (company?.trim() || null) : null}, company),
        contact_email     = COALESCE(${contactEmail !== undefined ? (contactEmail?.trim() || null) : null}, contact_email),
        contact_phone     = COALESCE(${contactPhone !== undefined ? (contactPhone?.trim() || null) : null}, contact_phone),
        status            = COALESCE(${status ?? null}, status),
        billing_reference = COALESCE(${billingReference !== undefined ? (billingReference?.trim() || null) : null}, billing_reference),
        notes             = COALESCE(${notes !== undefined ? (notes?.trim() || null) : null}, notes),
        documentation_5wh = COALESCE(${hasEnvelope ? envelopeForSql(mergeResult.envelope) : null}::jsonb, documentation_5wh),
        updated_at        = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Client not found', 404)
    return successResponse(transformClient(result[0]))
  } catch (error) {
    console.error('PATCH /api/clients/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update client', 500)
  }
}

/** DELETE /api/clients/[id] — soft delete (projects.client_id is set NULL by FK) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = authContext
    const result = await sql`
      UPDATE clients SET deleted_at = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (result.length === 0) return errorResponse(ErrorCodes.NOT_FOUND, 'Client not found', 404)
    // Soft-delete the client's active service schedules too
    await sql`
      UPDATE service_schedules SET deleted_at = NOW(), is_active = false
      WHERE client_id = ${params.id} AND deleted_at IS NULL
    `
    return successResponse({ id: params.id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/clients/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete client', 500)
  }
}
