/**
 * POST /api/work-orders/[id]/steps/[stepId]/check-in
 *
 * Agent check-in event loop for a claimed/in_progress step.
 *
 * Valid event types:
 *   progress         — heartbeat / partial progress
 *   blocker          — agent reports external blocker
 *   protocol_violation — protocol check failed
 *   retry            — retrying after a failure
 *   completion       — step done ✓ → triggers recomputeReadySteps
 *   failure          — step failed ✗ → also queries attempted_solutions for prior-art
 *   release          — agent releases claim without completing (step → ready)
 *
 * Body: { eventType, message?, payload?, outcomeSummary?, outcomeArtifacts? }
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { recomputeReadySteps } from '@/lib/work-orders/recompute'

export const dynamic = 'force-dynamic'

const VALID_EVENT_TYPES = [
  'progress',
  'blocker',
  'protocol_violation',
  'retry',
  'completion',
  'failure',
  'release',
] as const
type EventType = typeof VALID_EVENT_TYPES[number]

// Map event → resulting step status (undefined = no status change)
const EVENT_STATUS_MAP: Partial<Record<EventType, string>> = {
  completion: 'completed',
  failure:    'failed',
  blocker:    'blocked',
  release:    'ready',
  retry:      'in_progress',
  progress:   'in_progress',
  protocol_violation: 'in_progress',
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    // Verify work order ownership
    const woRows = await sql`
      SELECT id, status FROM work_orders
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (woRows.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)
    }

    // Load step
    const stepRows = await sql`
      SELECT * FROM work_order_steps
      WHERE id = ${params.stepId} AND work_order_id = ${params.id}
    `
    if (stepRows.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Step not found', 404)
    }
    const step = stepRows[0]

    const body = await request.json()
    const {
      eventType,
      message,
      payload,
      outcomeSummary,
      outcomeArtifacts,
    } = body

    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
        400
      )
    }

    const safeEventType = eventType as EventType

    // Validate: can't check in on a completed/skipped/cancelled step
    // (except retry after failure, or re-claiming after release)
    const terminalStatuses = ['completed', 'skipped']
    if (terminalStatuses.includes(step.status as string) && safeEventType !== 'retry') {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Step is in terminal state '${step.status}'. No check-ins allowed except retry.`,
        400
      )
    }

    // ---- Insert check-in event ----------------------------------------------
    await sql`
      INSERT INTO work_order_check_ins (
        step_id, work_order_id, event_type, message, payload, by_type, by_id, user_id
      ) VALUES (
        ${params.stepId},
        ${params.id},
        ${safeEventType},
        ${message ?? null},
        ${JSON.stringify(payload ?? {})}::jsonb,
        'user',
        ${userId},
        ${userId}
      )
    `

    // ---- Apply step status transition ----------------------------------------
    const newStepStatus = EVENT_STATUS_MAP[safeEventType]

    if (newStepStatus) {
      // Build update clauses based on event type
      const completedAt = safeEventType === 'completion' ? new Date().toISOString() : null
      const blockedReason =
        safeEventType === 'blocker' ? (payload?.reason ?? message ?? 'Blocker reported') : null

      if (safeEventType === 'release') {
        // Release: clear claim fields, set ready
        await sql`
          UPDATE work_order_steps SET
            status          = 'ready',
            claimed_by_type = NULL,
            claimed_by_id   = NULL,
            claimed_at      = NULL,
            updated_at      = NOW()
          WHERE id = ${params.stepId}
        `
      } else if (safeEventType === 'failure') {
        await sql`
          UPDATE work_order_steps SET
            status        = 'failed',
            retry_count   = retry_count + 1,
            updated_at    = NOW()
          WHERE id = ${params.stepId}
        `
      } else if (safeEventType === 'completion') {
        const safeOutcomeArtifacts = JSON.stringify(outcomeArtifacts ?? [])
        await sql`
          UPDATE work_order_steps SET
            status           = 'completed',
            completed_at     = ${completedAt}::timestamptz,
            outcome_summary  = COALESCE(${outcomeSummary ?? null}, outcome_summary),
            outcome_artifacts= ${safeOutcomeArtifacts}::jsonb,
            updated_at       = NOW()
          WHERE id = ${params.stepId}
        `
      } else if (safeEventType === 'blocker') {
        await sql`
          UPDATE work_order_steps SET
            status         = 'blocked',
            blocked_reason = ${blockedReason},
            updated_at     = NOW()
          WHERE id = ${params.stepId}
        `
      } else {
        // progress, retry, protocol_violation
        await sql`
          UPDATE work_order_steps SET
            status     = ${newStepStatus},
            updated_at = NOW()
          WHERE id = ${params.stepId}
        `
      }
    }

    // ---- Post-event side-effects -------------------------------------------

    let recomputeResult = null
    let priorArt: Record<string, unknown>[] = []

    if (safeEventType === 'completion') {
      // Promote any newly-unblocked steps to 'ready'
      recomputeResult = await recomputeReadySteps(params.id)
    }

    if (safeEventType === 'failure' || safeEventType === 'blocker') {
      // Query attempted_solutions for prior-art on this step title (fuzzy: ILIKE)
      const stepTitle = step.title as string
      priorArt = await sql`
        SELECT
          id, approach, approach_detail, outcome, failure_mode,
          root_cause, lessons_learned, prevention_strategy,
          tried_at
        FROM attempted_solutions
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND entity_type = 'work_order_step'
          AND (
            approach ILIKE ${'%' + stepTitle.substring(0, 60) + '%'}
            OR approach_detail ILIKE ${'%' + stepTitle.substring(0, 60) + '%'}
          )
        ORDER BY tried_at DESC
        LIMIT 10
      ` as Record<string, unknown>[]
    }

    // Fetch updated step for response
    const updatedStep = await sql`
      SELECT id, status, retry_count, blocked_reason, completed_at, outcome_summary,
             last_check_in_at, check_in_count
      FROM work_order_steps WHERE id = ${params.stepId}
    `

    return successResponse({
      stepId: params.stepId,
      workOrderId: params.id,
      eventType: safeEventType,
      step: updatedStep[0] ?? null,
      recompute: recomputeResult,
      priorArt: priorArt.length > 0
        ? { count: priorArt.length, solutions: priorArt }
        : null,
    })
  } catch (error) {
    console.error('POST /api/work-orders/[id]/steps/[stepId]/check-in error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to process check-in', 500)
  }
}
