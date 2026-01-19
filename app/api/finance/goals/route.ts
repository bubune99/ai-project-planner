import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { FinanceGoal } from '@/lib/types'

export const dynamic = 'force-dynamic'

function transformGoal(row: any): FinanceGoal {
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
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/goals
 * List all financial goals
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const activeOnly = searchParams.get('active') !== 'false'
    const goalType = searchParams.get('type')
    const includeCompleted = searchParams.get('completed') === 'true'

    const goals = await sql`
      SELECT g.*, a.name as account_name
      FROM finance_goals g
      LEFT JOIN finance_accounts a ON g.account_id = a.id
      WHERE g.user_id = ${userId}
        AND g.deleted_at IS NULL
        ${activeOnly ? sql`AND g.is_active = true` : sql``}
        ${!includeCompleted ? sql`AND g.is_completed = false` : sql``}
        ${goalType ? sql`AND g.goal_type = ${goalType}` : sql``}
      ORDER BY g.priority ASC, g.target_date ASC NULLS LAST, g.name ASC
    `

    // Calculate totals
    const totals = goals.reduce((acc, g) => ({
      totalTarget: acc.totalTarget + parseFloat(g.target_amount),
      totalSaved: acc.totalSaved + parseFloat(g.current_amount),
      completedCount: acc.completedCount + (g.is_completed ? 1 : 0)
    }), { totalTarget: 0, totalSaved: 0, completedCount: 0 })

    return successResponse(goals.map(transformGoal), {
      total: goals.length,
      totalTarget: totals.totalTarget,
      totalSaved: totals.totalSaved,
      completedCount: totals.completedCount,
      overallProgress: totals.totalTarget > 0
        ? Math.round((totals.totalSaved / totals.totalTarget) * 100)
        : 0
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/goals error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get goals', 500, error.message)
  }
}

/**
 * POST /api/finance/goals
 * Create a new financial goal
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
      name,
      description,
      goalType,
      targetAmount,
      currency,
      currentAmount,
      targetDate,
      accountId,
      autoContribute,
      contributeAmount,
      contributeFrequency,
      priority,
      color,
      icon,
      metadata
    } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Goal name is required', 400)
    }
    if (!goalType) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Goal type is required', 400)
    }
    if (!targetAmount || targetAmount <= 0) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Valid positive target amount is required', 400)
    }

    const result = await sql`
      INSERT INTO finance_goals (
        user_id, name, description, goal_type, target_amount, currency,
        current_amount, target_date, account_id, auto_contribute,
        contribute_amount, contribute_frequency, priority, color, icon, metadata
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${description || null},
        ${goalType},
        ${targetAmount},
        ${currency || 'USD'},
        ${currentAmount || 0},
        ${targetDate || null},
        ${accountId || null},
        ${autoContribute || false},
        ${contributeAmount || null},
        ${contributeFrequency || null},
        ${priority || 0},
        ${color || null},
        ${icon || null},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformGoal(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/goals error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create goal', 500, error.message)
  }
}
