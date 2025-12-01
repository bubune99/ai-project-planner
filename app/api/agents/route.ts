import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'

/**
 * GET /api/agents
 * List all agents and their status
 */
export async function GET(request: NextRequest) {
    try {
        const agents = await sql`
      SELECT *
      FROM agents
      ORDER BY name ASC
    `

        return successResponse(agents, {
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
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, status, currentTaskId } = body

        if (!name || !status) {
            return errorResponse(
                ErrorCodes.VALIDATION_ERROR,
                'name and status are required',
                400
            )
        }

        const result = await sql`
      UPDATE agents
      SET
        status = ${status},
        current_task_id = ${currentTaskId || null},
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

        return successResponse(result[0])
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
