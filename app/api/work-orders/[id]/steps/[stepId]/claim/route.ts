/**
 * POST /api/work-orders/[id]/steps/[stepId]/claim
 *
 * Atomically claims a 'ready' step for an agent.
 * Returns the step with its full instructions (JIT delivery).
 *
 * Body: { agentId, agentType }
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

const VALID_AGENT_TYPES = ['user', 'agent', 'system'] as const
type AgentType = typeof VALID_AGENT_TYPES[number]

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
    if (!['approved', 'in_progress'].includes(woRows[0].status as string)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Work order is not active (status: ${woRows[0].status}). Approve it first.`,
        400
      )
    }

    const body = await request.json()
    const { agentId, agentType } = body

    if (!agentId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required', 400)
    }
    const safeAgentType: AgentType = VALID_AGENT_TYPES.includes(agentType) ? agentType : 'agent'

    // Atomically claim: only succeeds if step is 'ready'
    const claimedAt = new Date().toISOString()
    const claimResult = await sql`
      UPDATE work_order_steps
      SET
        status          = 'claimed',
        claimed_by_type = ${safeAgentType},
        claimed_by_id   = ${agentId},
        claimed_at      = ${claimedAt}::timestamptz,
        updated_at      = NOW()
      WHERE id = ${params.stepId}
        AND work_order_id = ${params.id}
        AND status = 'ready'
      RETURNING *
    `

    if (claimResult.length === 0) {
      // Check if step exists at all
      const existsRows = await sql`
        SELECT id, status FROM work_order_steps
        WHERE id = ${params.stepId} AND work_order_id = ${params.id}
      `
      if (existsRows.length === 0) {
        return errorResponse(ErrorCodes.NOT_FOUND, 'Step not found', 404)
      }
      return errorResponse(
        ErrorCodes.CONFLICT,
        `Step is not in 'ready' state (current: ${existsRows[0].status}). Cannot claim.`,
        409
      )
    }

    const step = claimResult[0]

    // Insert check-in event for the claim
    await sql`
      INSERT INTO work_order_check_ins (
        step_id, work_order_id, event_type, message, payload, by_type, by_id, user_id
      ) VALUES (
        ${params.stepId},
        ${params.id},
        'claim',
        ${`Step claimed by ${agentType} ${agentId}`},
        ${{ claimed_by_type: safeAgentType, claimed_by_id: agentId, claimed_at: claimedAt }}::jsonb,
        ${safeAgentType},
        ${agentId},
        ${userId}
      )
    `

    // Promote work order to 'in_progress' if it was 'approved'
    await sql`
      UPDATE work_orders
      SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = ${params.id} AND status = 'approved'
    `

    // Return the full step with instructions (JIT delivery)
    return successResponse({
      id: step.id,
      workOrderId: step.work_order_id,
      stepOrder: step.step_order,
      level: step.level,
      parallelGroup: step.parallel_group,
      title: step.title,
      description: step.description,
      stepType: step.step_type,
      status: step.status,
      claimedByType: step.claimed_by_type,
      claimedById: step.claimed_by_id,
      claimedAt: step.claimed_at,
      // JIT delivery — full instructions
      instructions: step.instructions,
      acceptanceCriteria: step.acceptance_criteria ?? [],
      stepReferences: step.step_references ?? [],
      expectedArtifacts: step.expected_artifacts ?? [],
      requiredCapabilities: step.required_capabilities ?? [],
      prerequisites: step.prerequisites ?? [],
      provides: step.provides ?? [],
      requires: step.requires ?? [],
    })
  } catch (error) {
    console.error('POST /api/work-orders/[id]/steps/[stepId]/claim error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to claim step', 500)
  }
}
