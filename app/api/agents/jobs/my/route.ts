import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform job row to frontend format
 */
function transformJob(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    status: row.status,
    priority: row.priority,
    input: row.input || {},
    result: row.result,
    error: row.error,
    parentJobId: row.parent_job_id,
    progress: row.progress || 0,
    conversationId: row.conversation_id,
    tags: row.tags || [],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/agents/jobs/my
 * Get jobs assigned to or created by a specific agent
 *
 * Query params:
 * - agentId: string (required) - The agent ID to get jobs for
 * - includeCompleted: "true" to include completed jobs (default: false)
 * - role: "assigned" | "created" | "all" (default: "all")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const includeCompleted = searchParams.get('includeCompleted') === 'true'
    const role = searchParams.get('role') || 'all'

    if (!agentId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required', 400)
    }

    let jobs

    if (role === 'assigned') {
      // Jobs assigned to this agent
      jobs = await sql`
        SELECT * FROM agent_jobs
        WHERE assigned_to = ${agentId}
          ${!includeCompleted ? sql`AND status NOT IN ('completed', 'failed', 'cancelled')` : sql``}
        ORDER BY
          CASE status
            WHEN 'in_progress' THEN 1
            WHEN 'assigned' THEN 2
            WHEN 'pending' THEN 3
            ELSE 4
          END,
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          created_at DESC
      `
    } else if (role === 'created') {
      // Jobs created by this agent
      jobs = await sql`
        SELECT * FROM agent_jobs
        WHERE created_by = ${agentId}
          ${!includeCompleted ? sql`AND status NOT IN ('completed', 'failed', 'cancelled')` : sql``}
        ORDER BY created_at DESC
      `
    } else {
      // All jobs related to this agent
      jobs = await sql`
        SELECT * FROM agent_jobs
        WHERE (assigned_to = ${agentId} OR created_by = ${agentId})
          ${!includeCompleted ? sql`AND status NOT IN ('completed', 'failed', 'cancelled')` : sql``}
        ORDER BY
          CASE WHEN assigned_to = ${agentId} AND status = 'in_progress' THEN 0 ELSE 1 END,
          CASE status
            WHEN 'in_progress' THEN 1
            WHEN 'assigned' THEN 2
            WHEN 'pending' THEN 3
            ELSE 4
          END,
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          created_at DESC
      `
    }

    // Group jobs by role
    const assigned = jobs.filter((j: any) => j.assigned_to === agentId)
    const created = jobs.filter((j: any) => j.created_by === agentId && j.assigned_to !== agentId)

    return successResponse({
      assigned: assigned.map(transformJob),
      created: created.map(transformJob),
      summary: {
        totalAssigned: assigned.length,
        totalCreated: created.length,
        inProgress: jobs.filter((j: any) => j.status === 'in_progress').length,
        pending: jobs.filter((j: any) => j.status === 'pending' || j.status === 'assigned').length
      }
    })
  } catch (error: any) {
    console.error('[API] GET /api/agents/jobs/my error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get agent jobs',
      500,
      error.message
    )
  }
}
