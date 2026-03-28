import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform agent row to frontend format
 */
function transformAgent(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentTaskId: row.current_task_id,
    lastActiveAt: row.last_active_at,
    capabilities: row.capabilities || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Include task info if joined
    currentTask: row.task_title ? {
      id: row.current_task_id,
      title: row.task_title,
      status: row.task_status
    } : null
  }
}

/**
 * GET /api/agents
 * List all agents and their status
 *
 * Query params:
 * - status: "active" | "idle" | "working" | "error" (filter by status)
 * - withTask: "true" (include current task info)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const withTask = searchParams.get('withTask') === 'true'

    let agents: any[]

    if (withTask) {
      agents = await sql`
        SELECT
          a.*,
          ps.title as task_title,
          ps.status as task_status
        FROM agents a
        LEFT JOIN project_steps ps ON a.current_task_id = ps.id
        ${status ? sql`WHERE a.status = ${status}` : sql``}
        ORDER BY a.name ASC
      `
    } else {
      agents = await sql`
        SELECT * FROM agents
        ${status ? sql`WHERE status = ${status}` : sql``}
        ORDER BY name ASC
      `
    }

    return successResponse(agents.map(transformAgent), {
      total: agents.length
    })
  } catch (error: any) {
    console.error('[GET /api/agents] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get agents',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/agents
 * Update agent status
 *
 * Body: {
 *   name: string (required) - Agent name
 *   status?: "active" | "idle" | "working" | "error"
 *   currentTaskId?: UUID | null
 *   capabilities?: object
 *   metadata?: object
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const body = await request.json()
    const { name, status, currentTaskId, capabilities, metadata } = body

    if (!name) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Agent name is required',
        400
      )
    }

    // Validate status if provided
    const validStatuses = ['active', 'idle', 'working', 'error']
    if (status && !validStatuses.includes(status)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400
      )
    }

    const result = await sql`
      UPDATE agents
      SET
        status = COALESCE(${status || null}, status),
        current_task_id = ${currentTaskId === null ? null : (currentTaskId || null)},
        capabilities = COALESCE(${capabilities ? JSON.stringify(capabilities) : null}, capabilities),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}, metadata),
        last_active_at = NOW()
      WHERE name = ${name}
      RETURNING *
    `

    if (result.length === 0) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        `Agent ${name} not found`,
        404
      )
    }

    return successResponse(transformAgent(result[0]))
  } catch (error: any) {
    console.error('[PATCH /api/agents] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update agent',
      500,
      error.message
    )
  }
}

/**
 * POST /api/agents/assign
 * Assign a task to an agent (uses database function)
 *
 * Body: {
 *   taskId: UUID (required)
 *   agentName: string (required)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const body = await request.json()
    const { taskId, agentName, action } = body

    // Handle assignment action
    if (action === 'assign') {
      if (!taskId || !agentName) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'taskId and agentName are required for assignment',
          400
        )
      }

      // Use the database function to assign
      await sql`SELECT assign_task_to_agent(${taskId}::uuid, ${agentName})`

      // Get updated agent info
      const agent = await sql`
        SELECT a.*, ps.title as task_title, ps.status as task_status
        FROM agents a
        LEFT JOIN project_steps ps ON a.current_task_id = ps.id
        WHERE a.name = ${agentName}
      `

      return successResponse(transformAgent(agent[0]), undefined, 200)
    }

    // Handle completion action
    if (action === 'complete') {
      if (!taskId) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'taskId is required for completion',
          400
        )
      }

      // Use the database function to complete
      await sql`SELECT complete_task_for_agent(${taskId}::uuid)`

      return successResponse({ completed: true, taskId })
    }

    return errorResponse(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid action. Use "assign" or "complete"',
      400
    )
  } catch (error: any) {
    console.error('[POST /api/agents] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to process agent action',
      500,
      error.message
    )
  }
}
