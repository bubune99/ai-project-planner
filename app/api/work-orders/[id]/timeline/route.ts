/**
 * /api/work-orders/[id]/timeline
 *
 * GET — the "what did the agent actually do" story for one work order:
 *   - check-ins across all of the work order's steps (append-only event log)
 *   - attempted_solutions recorded against the work order or any of its steps
 *
 * The existing GET /api/work-orders/[id] returns the work order + steps.
 * This endpoint supplies the per-step check-in timeline that the detail view
 * needs — the listing query for check-ins was otherwise missing.
 *
 * Scoped by user_id: we only return timeline data for a work order the caller owns.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformCheckIn(row: Record<string, unknown>) {
  return {
    id: row.id,
    stepId: row.step_id,
    workOrderId: row.work_order_id,
    eventType: row.event_type,
    message: row.message,
    payload: row.payload ?? {},
    byType: row.by_type,
    byId: row.by_id,
    createdAt: row.created_at,
  }
}

function transformAttempt(row: Record<string, unknown>) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    approach: row.approach,
    approachDetail: row.approach_detail,
    outcome: row.outcome,
    failureMode: row.failure_mode,
    rootCause: row.root_cause,
    lessonsLearned: row.lessons_learned,
    preventionStrategy: row.prevention_strategy,
    attemptedByType: row.attempted_by_type,
    attemptedById: row.attempted_by_id,
    triedAt: row.tried_at,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    // Ownership gate: only expose the timeline for a work order the caller owns.
    const woRows = (await sql`
      SELECT id FROM work_orders
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
    `) as Record<string, unknown>[]
    if (woRows.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)
    }

    // All check-ins for the work order, oldest-first so a step's story reads top-to-bottom.
    const checkInRows = (await sql`
      SELECT id, step_id, work_order_id, event_type, message, payload, by_type, by_id, created_at
      FROM work_order_check_ins
      WHERE work_order_id = ${params.id} AND user_id = ${userId}
      ORDER BY created_at ASC
    `) as Record<string, unknown>[]

    // Attempts recorded against the work order itself or any of its steps.
    const attemptRows = (await sql`
      SELECT a.*
      FROM attempted_solutions a
      WHERE a.user_id = ${userId}
        AND a.deleted_at IS NULL
        AND (
          (a.entity_type = 'work_order' AND a.entity_id = ${params.id})
          OR (a.entity_type = 'work_order_step' AND a.entity_id IN (
            SELECT id FROM work_order_steps WHERE work_order_id = ${params.id}
          ))
        )
      ORDER BY a.tried_at DESC
    `) as Record<string, unknown>[]

    return successResponse({
      checkIns: checkInRows.map(transformCheckIn),
      attempts: attemptRows.map(transformAttempt),
    })
  } catch (error) {
    console.error('GET /api/work-orders/[id]/timeline error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load work order timeline', 500)
  }
}
