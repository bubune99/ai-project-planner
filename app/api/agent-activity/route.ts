/**
 * /api/agent-activity
 *
 * GET — most recent work-order check-ins across ALL of the caller's projects,
 * newest first. Powers the dashboard "Agent activity" card: a single glance at
 * what agents are doing everywhere, with the agent id and project name.
 *
 * Scoped by user_id on work_order_check_ins (every check-in carries the owner).
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '10', 10) || 10, 50)

    const rows = (await sql`
      SELECT
        ci.id::text                    AS id,
        ci.event_type                  AS event_type,
        COALESCE(wos.title, wo.title)  AS step_title,
        ci.message                     AS message,
        ci.by_id                       AS agent_id,
        ci.by_type                     AS actor_type,
        ci.created_at                  AS created_at,
        wo.id::text                    AS work_order_id,
        wo.title                       AS work_order_title,
        p.id::text                     AS project_id,
        p.name                         AS project_name
      FROM work_order_check_ins ci
      JOIN work_orders wo ON wo.id = ci.work_order_id AND wo.deleted_at IS NULL
      JOIN projects p ON p.id = wo.project_id AND p.deleted_at IS NULL
      LEFT JOIN work_order_steps wos ON wos.id = ci.step_id
      WHERE ci.user_id = ${userId}
      ORDER BY ci.created_at DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[]

    return successResponse(rows, { total: rows.length, limit })
  } catch (error) {
    console.error('GET /api/agent-activity error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load agent activity', 500)
  }
}
