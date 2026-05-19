import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export interface Client {
  id: string
  userId: string
  name: string
  company: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: 'active' | 'paused' | 'churned' | 'prospect'
  billingReference: string | null
  notes: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  projectCount: number
  activeScheduleCount: number
  nextServiceDate: string | null
}

function transformClient(row: any): Client {
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
    projectCount: Number(row.project_count ?? 0),
    activeScheduleCount: Number(row.active_schedule_count ?? 0),
    nextServiceDate: row.next_service_date ?? null,
  }
}

/**
 * GET /api/clients
 * List the authenticated user's clients with computed project/schedule rollups.
 * Query params: ?status=active|paused|churned|prospect  ?search=<text>
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const rows = await sql`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM projects p
           WHERE p.client_id = c.id AND p.deleted_at IS NULL) AS project_count,
        (SELECT COUNT(*) FROM service_schedules s
           WHERE s.client_id = c.id AND s.is_active = true AND s.deleted_at IS NULL) AS active_schedule_count,
        (SELECT MIN(s.next_occurrence) FROM service_schedules s
           WHERE s.client_id = c.id AND s.is_active = true AND s.deleted_at IS NULL) AS next_service_date
      FROM clients c
      WHERE c.user_id = ${userId}
        AND c.deleted_at IS NULL
        AND (${status}::text IS NULL OR c.status = ${status})
        AND (${search}::text IS NULL
             OR c.name ILIKE ${'%' + (search ?? '') + '%'}
             OR c.company ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY c.status ASC, c.name ASC
    `

    const clients = rows.map(transformClient)
    const counts = {
      active: clients.filter(c => c.status === 'active').length,
      paused: clients.filter(c => c.status === 'paused').length,
      churned: clients.filter(c => c.status === 'churned').length,
      prospect: clients.filter(c => c.status === 'prospect').length,
      total: clients.length,
    }
    return successResponse(clients, { counts } as any)
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load clients', 500)
  }
}

/**
 * POST /api/clients
 * Body: { name (required), company?, contactEmail?, contactPhone?, status?, billingReference?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const body = await request.json()
    const { name, company, contactEmail, contactPhone, status, billingReference, notes } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Name is required', 400)
    }
    const safeStatus = ['active', 'paused', 'churned', 'prospect'].includes(status) ? status : 'active'

    const result = await sql`
      INSERT INTO clients (user_id, name, company, contact_email, contact_phone, status, billing_reference, notes)
      VALUES (
        ${userId},
        ${name.trim()},
        ${company?.trim() || null},
        ${contactEmail?.trim() || null},
        ${contactPhone?.trim() || null},
        ${safeStatus},
        ${billingReference?.trim() || null},
        ${notes?.trim() || null}
      )
      RETURNING *
    `
    return successResponse(transformClient(result[0]), undefined, 201)
  } catch (error) {
    console.error('POST /api/clients error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create client', 500)
  }
}
