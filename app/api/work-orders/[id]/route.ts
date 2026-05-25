/**
 * /api/work-orders/[id]
 *
 * GET    — return work_order + nested steps
 * PATCH  — status transitions (approve, pause, cancel) + metadata update
 * DELETE — soft delete (cascades to steps via FK)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

// ============================================================================
// Helpers
// ============================================================================

async function ownedWorkOrder(id: string, userId: string) {
  const rows = await sql`
    SELECT id, status, project_id, documentation_5wh
    FROM work_orders
    WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return rows[0] ?? null
}

function transformStep(row: Record<string, unknown>) {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    stepOrder: row.step_order,
    level: row.level,
    parallelGroup: row.parallel_group,
    title: row.title,
    description: row.description,
    stepType: row.step_type,
    sourceSkillId: row.source_skill_id,
    sourceSkillVersion: row.source_skill_version,
    prerequisites: row.prerequisites ?? [],
    provides: row.provides ?? [],
    requires: row.requires ?? [],
    instructions: row.instructions,
    acceptanceCriteria: row.acceptance_criteria ?? [],
    stepReferences: row.step_references ?? [],
    expectedArtifacts: row.expected_artifacts ?? [],
    requiredCapabilities: row.required_capabilities ?? [],
    status: row.status,
    claimedByType: row.claimed_by_type,
    claimedById: row.claimed_by_id,
    claimedAt: row.claimed_at,
    lastCheckInAt: row.last_check_in_at,
    checkInCount: row.check_in_count,
    completedAt: row.completed_at,
    outcomeSummary: row.outcome_summary,
    outcomeArtifacts: row.outcome_artifacts ?? [],
    retryCount: row.retry_count,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ============================================================================
// GET /api/work-orders/[id]
// ============================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const woRows = await sql`
      SELECT * FROM work_orders
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (woRows.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)
    }

    const wo = woRows[0]
    const stepRows = await sql`
      SELECT * FROM work_order_steps
      WHERE work_order_id = ${params.id}
      ORDER BY step_order ASC
    `

    return successResponse({
      id: wo.id,
      title: wo.title,
      description: wo.description,
      status: wo.status,
      sourceType: wo.source_type,
      sourceTemplateId: wo.source_template_id,
      sourceTemplateVersion: wo.source_template_version,
      insertionStrategy: wo.insertion_strategy,
      parallelismRecommended: wo.parallelism_recommended,
      projectId: wo.project_id,
      userId: wo.user_id,
      createdByType: wo.created_by_type,
      createdById: wo.created_by_id,
      approvedAt: wo.approved_at,
      startedAt: wo.started_at,
      completedAt: wo.completed_at,
      createdAt: wo.created_at,
      updatedAt: wo.updated_at,
      metadata: wo.metadata ?? {},
      steps: stepRows.map(transformStep),
    })
  } catch (error) {
    console.error('GET /api/work-orders/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load work order', 500)
  }
}

// ============================================================================
// PATCH /api/work-orders/[id]
// ============================================================================

// Valid status transitions (from → allowed tos)
const STATUS_TRANSITIONS: Record<string, string[]> = {
  proposed:    ['approved', 'cancelled'],
  approved:    ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'completed', 'failed', 'cancelled'],
  paused:      ['approved', 'in_progress', 'cancelled'],
  completed:   [], // terminal
  cancelled:   [], // terminal
  failed:      ['approved'], // allow re-open
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const wo = await ownedWorkOrder(params.id, userId)
    if (!wo) return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)

    const body = await request.json()
    const { status: newStatus, title, description } = body

    // Validate status transition
    if (newStatus !== undefined) {
      const allowed = STATUS_TRANSITIONS[wo.status as string] ?? []
      if (!allowed.includes(newStatus)) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          `Cannot transition from '${wo.status}' to '${newStatus}'. Allowed: [${allowed.join(', ')}]`,
          400
        )
      }
    }

    // Merge envelope
    const mergeResult = mergeEnvelopeForPatch(
      wo.documentation_5wh,
      body,
      { userId, projectId: wo.project_id as string },
      {
        type: 'work_order',
        title: (title as string | undefined) || undefined,
        rationale:
          body.documentation_5wh?.why?.rationale ||
          `Updated via PATCH /api/work-orders/${params.id}`,
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    // Compute timestamps for transitions
    const approvedAt =
      newStatus === 'approved' ? new Date().toISOString() : undefined
    const startedAt =
      newStatus === 'in_progress' ? new Date().toISOString() : undefined
    const completedAt =
      newStatus === 'completed' ? new Date().toISOString() : undefined

    const result = await sql`
      UPDATE work_orders SET
        status            = COALESCE(${newStatus ?? null}, status),
        title             = COALESCE(${title ?? null}, title),
        description       = COALESCE(${description ?? null}, description),
        approved_at       = COALESCE(${approvedAt ?? null}::timestamptz, approved_at),
        started_at        = COALESCE(${startedAt ?? null}::timestamptz, started_at),
        completed_at      = COALESCE(${completedAt ?? null}::timestamptz, completed_at),
        documentation_5wh = ${envelopeForSql(mergeResult.envelope)}::jsonb,
        updated_at        = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `
    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)
    }

    return successResponse({
      id: result[0].id,
      status: result[0].status,
      title: result[0].title,
      description: result[0].description,
      approvedAt: result[0].approved_at,
      startedAt: result[0].started_at,
      completedAt: result[0].completed_at,
      updatedAt: result[0].updated_at,
    })
  } catch (error) {
    console.error('PATCH /api/work-orders/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update work order', 500)
  }
}

// ============================================================================
// DELETE /api/work-orders/[id]
// ============================================================================

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const result = await sql`
      UPDATE work_orders
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${params.id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)
    }
    // Steps are cascade-deleted at DB level via FK ON DELETE CASCADE.
    return successResponse({ id: params.id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/work-orders/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete work order', 500)
  }
}
