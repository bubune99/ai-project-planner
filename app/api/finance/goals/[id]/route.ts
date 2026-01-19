import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformGoal(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    goalType: row.goal_type,
    targetAmount: parseFloat(row.target_amount),
    currency: row.currency,
    currentAmount: parseFloat(row.current_amount),
    targetDate: row.target_date,
    startedAt: row.started_at,
    accountId: row.account_id,
    accountName: row.account_name,
    autoContribute: row.auto_contribute,
    contributeAmount: row.contribute_amount ? parseFloat(row.contribute_amount) : null,
    contributeFrequency: row.contribute_frequency,
    priority: row.priority,
    isActive: row.is_active,
    isCompleted: row.is_completed,
    completedAt: row.completed_at,
    color: row.color,
    icon: row.icon,
    imageBlobKey: row.image_blob_key,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: row.target_amount > 0
      ? Math.round((parseFloat(row.current_amount) / parseFloat(row.target_amount)) * 100)
      : 0
  }
}

/**
 * GET /api/finance/goals/[id]
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

    const goals = await sql`
      SELECT g.*, a.name as account_name
      FROM finance_goals g
      LEFT JOIN finance_accounts a ON g.account_id = a.id
      WHERE g.id = ${id} AND g.user_id = ${userId} AND g.deleted_at IS NULL
    `

    if (goals.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Goal not found', 404)
    }

    return successResponse(transformGoal(goals[0]))
  } catch (error: any) {
    console.error('[API] GET /api/finance/goals/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get goal', 500, error.message)
  }
}

/**
 * PATCH /api/finance/goals/[id]
 * Update a goal (including adding contributions)
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
      SELECT * FROM finance_goals
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Goal not found', 404)
    }

    const {
      name,
      description,
      targetAmount,
      currentAmount,
      addContribution, // Special field to add to current amount
      targetDate,
      accountId,
      autoContribute,
      contributeAmount,
      contributeFrequency,
      priority,
      isActive,
      color,
      icon,
      metadata
    } = body

    // Calculate new current amount if adding a contribution
    let newCurrentAmount = currentAmount
    if (addContribution && addContribution > 0) {
      newCurrentAmount = parseFloat(existing[0].current_amount) + addContribution
    }

    // Check if goal should be marked complete
    const target = targetAmount || parseFloat(existing[0].target_amount)
    const current = newCurrentAmount || parseFloat(existing[0].current_amount)
    const shouldComplete = current >= target

    const result = await sql`
      UPDATE finance_goals SET
        name = COALESCE(${name}, name),
        description = COALESCE(${description}, description),
        target_amount = COALESCE(${targetAmount}, target_amount),
        current_amount = COALESCE(${newCurrentAmount}, current_amount),
        target_date = COALESCE(${targetDate}, target_date),
        account_id = COALESCE(${accountId}, account_id),
        auto_contribute = COALESCE(${autoContribute}, auto_contribute),
        contribute_amount = COALESCE(${contributeAmount}, contribute_amount),
        contribute_frequency = COALESCE(${contributeFrequency}, contribute_frequency),
        priority = COALESCE(${priority}, priority),
        is_active = COALESCE(${isActive}, is_active),
        is_completed = ${shouldComplete},
        completed_at = ${shouldComplete ? sql`NOW()` : sql`completed_at`},
        color = COALESCE(${color}, color),
        icon = COALESCE(${icon}, icon),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata)
      WHERE id = ${id}
      RETURNING *
    `

    // Fetch with account name
    const updated = await sql`
      SELECT g.*, a.name as account_name
      FROM finance_goals g
      LEFT JOIN finance_accounts a ON g.account_id = a.id
      WHERE g.id = ${id}
    `

    return successResponse(transformGoal(updated[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/finance/goals/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update goal', 500, error.message)
  }
}

/**
 * DELETE /api/finance/goals/[id]
 * Soft delete a goal
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
      UPDATE finance_goals
      SET deleted_at = NOW(), is_active = false
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Goal not found', 404)
    }

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/finance/goals/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete goal', 500, error.message)
  }
}
