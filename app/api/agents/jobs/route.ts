import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

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
    updatedAt: row.updated_at,
    // Include checkpoints if joined
    checkpoints: row.checkpoints || null,
    // Include agent info if joined
    agent: row.agent_name ? {
      id: row.assigned_to,
      name: row.agent_name,
      status: row.agent_status
    } : null
  }
}

/**
 * GET /api/agents/jobs
 * List jobs with optional filters
 *
 * Query params:
 * - status: pending | assigned | in_progress | completed | failed | cancelled
 * - priority: low | normal | high | critical
 * - assignedTo: agent ID
 * - createdBy: agent/user ID
 * - tag: filter by tag
 * - includeCompleted: "true" to include completed/failed/cancelled
 * - limit: number (default 50)
 * - offset: number (pagination)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedTo = searchParams.get('assignedTo')
    const createdBy = searchParams.get('createdBy')
    const tag = searchParams.get('tag')
    const includeCompleted = searchParams.get('includeCompleted') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const jobs = await sql`
      SELECT
        j.*,
        a.name as agent_name,
        a.status as agent_status
      FROM agent_jobs j
      LEFT JOIN agents a ON j.assigned_to = a.name
      WHERE 1=1
        ${status ? sql`AND j.status = ${status}` : sql``}
        ${priority ? sql`AND j.priority = ${priority}` : sql``}
        ${assignedTo ? sql`AND j.assigned_to = ${assignedTo}` : sql``}
        ${createdBy ? sql`AND j.created_by = ${createdBy}` : sql``}
        ${tag ? sql`AND ${tag} = ANY(j.tags)` : sql``}
        ${!includeCompleted ? sql`AND j.status NOT IN ('completed', 'failed', 'cancelled')` : sql``}
      ORDER BY
        CASE j.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        j.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as count FROM agent_jobs
      WHERE 1=1
        ${status ? sql`AND status = ${status}` : sql``}
        ${priority ? sql`AND priority = ${priority}` : sql``}
        ${assignedTo ? sql`AND assigned_to = ${assignedTo}` : sql``}
        ${createdBy ? sql`AND created_by = ${createdBy}` : sql``}
        ${tag ? sql`AND ${tag} = ANY(tags)` : sql``}
        ${!includeCompleted ? sql`AND status NOT IN ('completed', 'failed', 'cancelled')` : sql``}
    `

    return successResponse(jobs.map(transformJob), {
      total: parseInt(countResult[0]?.count || '0'),
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/agents/jobs error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get jobs',
      500,
      error.message
    )
  }
}

/**
 * POST /api/agents/jobs
 * Create a new job
 *
 * Body: {
 *   title: string (required)
 *   description?: string
 *   createdBy: string (required - agent ID or user ID)
 *   assignedTo?: string (optional - pre-assign to agent)
 *   priority?: "low" | "normal" | "high" | "critical"
 *   input?: object
 *   parentJobId?: UUID
 *   tags?: string[]
 *   ttl?: string (e.g., "24h", "7d")
 *   metadata?: object
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const body = await request.json()
    const {
      title,
      description,
      createdBy,
      assignedTo,
      priority = 'normal',
      input,
      parentJobId,
      tags,
      ttl,
      metadata
    } = body

    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }

    if (!createdBy?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'createdBy is required', 400)
    }

    // Validate priority
    const validPriorities = ['low', 'normal', 'high', 'critical']
    if (!validPriorities.includes(priority)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
        400
      )
    }

    // Parse TTL to interval format
    let ttlInterval = '24 hours'
    if (ttl) {
      const match = ttl.match(/^(\d+)(m|h|d)$/)
      if (match) {
        const value = parseInt(match[1])
        const unit = match[2]
        switch (unit) {
          case 'm': ttlInterval = `${value} minutes`; break
          case 'h': ttlInterval = `${value} hours`; break
          case 'd': ttlInterval = `${value} days`; break
        }
      }
    }

    const result = await sql`
      INSERT INTO agent_jobs (
        title,
        description,
        created_by,
        assigned_to,
        status,
        priority,
        input,
        parent_job_id,
        tags,
        ttl,
        metadata
      ) VALUES (
        ${title.trim()},
        ${description?.trim() || null},
        ${createdBy.trim()},
        ${assignedTo?.trim() || null},
        ${assignedTo ? 'assigned' : 'pending'},
        ${priority},
        ${input ? JSON.stringify(input) : '{}'},
        ${parentJobId || null},
        ${tags || []},
        ${ttlInterval}::interval,
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformJob(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/agents/jobs error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create job',
      500,
      error.message
    )
  }
}
