import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform job row to frontend format
 */
function transformJob(row: any, checkpoints?: any[]) {
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
    checkpoints: checkpoints?.map(c => ({
      id: c.id,
      agentId: c.agent_id,
      progress: c.progress,
      message: c.message,
      data: c.data || {},
      createdAt: c.created_at
    })) || null
  }
}

/**
 * GET /api/agents/jobs/[id]
 * Get a specific job with optional checkpoints
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeCheckpoints = searchParams.get('includeCheckpoints') !== 'false'

    const job = await sql`
      SELECT * FROM agent_jobs WHERE id = ${id}
    `

    if (job.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Job not found', 404)
    }

    let checkpoints: any[] | undefined
    if (includeCheckpoints) {
      checkpoints = await sql`
        SELECT * FROM agent_job_checkpoints
        WHERE job_id = ${id}
        ORDER BY created_at DESC
      `
    }

    return successResponse(transformJob(job[0], checkpoints))
  } catch (error: any) {
    console.error('[API] GET /api/agents/jobs/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get job',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/agents/jobs/[id]
 * Update a job or perform actions
 *
 * Body: {
 *   action: "assign" | "claim" | "start" | "checkpoint" | "complete" | "fail" | "cancel" | "resume"
 *   agentId?: string (for assign, claim, start, checkpoint, resume)
 *   result?: any (for complete)
 *   error?: string (for fail)
 *   reason?: string (for cancel)
 *   progress?: number (for checkpoint)
 *   message?: string (for checkpoint)
 *   data?: object (for checkpoint)
 *   conversationId?: UUID (for linking to conversation)
 * }
 *
 * Or simple update:
 * {
 *   title?: string
 *   description?: string
 *   priority?: string
 *   tags?: string[]
 *   metadata?: object
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Get current job
    const current = await sql`
      SELECT * FROM agent_jobs WHERE id = ${id}
    `

    if (current.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Job not found', 404)
    }

    const job = current[0]

    // Handle actions
    if (body.action) {
      switch (body.action) {
        case 'assign': {
          const { agentId, assignedBy } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for assign', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET assigned_to = ${agentId},
                status = 'assigned',
                metadata = metadata || ${JSON.stringify({ assignedBy: assignedBy || 'unknown' })}::jsonb
            WHERE id = ${id}
            RETURNING *
          `
          return successResponse(transformJob(result[0]))
        }

        case 'claim': {
          const { agentId } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for claim', 400)
          }

          if (job.status !== 'pending') {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Only pending jobs can be claimed', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET assigned_to = ${agentId},
                status = 'assigned'
            WHERE id = ${id} AND status = 'pending'
            RETURNING *
          `

          if (result.length === 0) {
            return errorResponse(ErrorCodes.CONFLICT, 'Job was already claimed', 409)
          }

          return successResponse(transformJob(result[0]))
        }

        case 'start': {
          const { agentId } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for start', 400)
          }

          if (!['pending', 'assigned'].includes(job.status)) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Job must be pending or assigned to start', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET assigned_to = ${agentId},
                status = 'in_progress',
                started_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `
          return successResponse(transformJob(result[0]))
        }

        case 'checkpoint': {
          const { agentId, progress, message, data } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for checkpoint', 400)
          }
          if (progress === undefined) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'progress is required for checkpoint', 400)
          }

          // Create checkpoint
          await sql`
            INSERT INTO agent_job_checkpoints (job_id, agent_id, progress, message, data)
            VALUES (${id}, ${agentId}, ${progress}, ${message || null}, ${data ? JSON.stringify(data) : '{}'})
          `

          // Update job progress
          const result = await sql`
            UPDATE agent_jobs
            SET progress = ${progress}
            WHERE id = ${id}
            RETURNING *
          `

          // Get all checkpoints
          const checkpoints = await sql`
            SELECT * FROM agent_job_checkpoints
            WHERE job_id = ${id}
            ORDER BY created_at DESC
          `

          return successResponse(transformJob(result[0], checkpoints))
        }

        case 'complete': {
          const { agentId, result: jobResult } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for complete', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET status = 'completed',
                result = ${jobResult ? JSON.stringify(jobResult) : null},
                progress = 100,
                completed_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `
          return successResponse(transformJob(result[0]))
        }

        case 'fail': {
          const { agentId, error } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for fail', 400)
          }
          if (!error) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'error is required for fail', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET status = 'failed',
                error = ${error},
                completed_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `
          return successResponse(transformJob(result[0]))
        }

        case 'cancel': {
          const { cancelledBy, reason } = body
          if (!cancelledBy) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'cancelledBy is required for cancel', 400)
          }

          const result = await sql`
            UPDATE agent_jobs
            SET status = 'cancelled',
                metadata = metadata || ${JSON.stringify({
                  cancelledBy,
                  cancelReason: reason || null,
                  cancelledAt: new Date().toISOString()
                })}::jsonb,
                completed_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `
          return successResponse(transformJob(result[0]))
        }

        case 'resume': {
          const { agentId } = body
          if (!agentId) {
            return errorResponse(ErrorCodes.VALIDATION_ERROR, 'agentId is required for resume', 400)
          }

          // Get latest checkpoint
          const checkpoints = await sql`
            SELECT * FROM agent_job_checkpoints
            WHERE job_id = ${id}
            ORDER BY created_at DESC
            LIMIT 1
          `

          const result = await sql`
            UPDATE agent_jobs
            SET assigned_to = ${agentId},
                status = 'in_progress',
                started_at = COALESCE(started_at, NOW())
            WHERE id = ${id}
            RETURNING *
          `

          return successResponse({
            ...transformJob(result[0]),
            latestCheckpoint: checkpoints.length > 0 ? {
              id: checkpoints[0].id,
              progress: checkpoints[0].progress,
              message: checkpoints[0].message,
              data: checkpoints[0].data || {},
              createdAt: checkpoints[0].created_at
            } : null
          })
        }

        default:
          return errorResponse(ErrorCodes.VALIDATION_ERROR, `Unknown action: ${body.action}`, 400)
      }
    }

    // Handle simple updates
    const { title, description, priority, tags, metadata, conversationId } = body

    // Validate priority if provided
    if (priority) {
      const validPriorities = ['low', 'normal', 'high', 'critical']
      if (!validPriorities.includes(priority)) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          `Invalid priority. Must be one of: ${validPriorities.join(', ')}`,
          400
        )
      }
    }

    const result = await sql`
      UPDATE agent_jobs
      SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        priority = COALESCE(${priority ?? null}, priority),
        tags = COALESCE(${tags ?? null}, tags),
        conversation_id = COALESCE(${conversationId ?? null}, conversation_id),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}, metadata)
      WHERE id = ${id}
      RETURNING *
    `

    return successResponse(transformJob(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/agents/jobs/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update job',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/agents/jobs/[id]
 * Delete a job (only if pending or cancelled)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get job first
    const current = await sql`
      SELECT status FROM agent_jobs WHERE id = ${id}
    `

    if (current.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Job not found', 404)
    }

    // Only allow deleting pending or cancelled jobs
    if (!['pending', 'cancelled'].includes(current[0].status)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Only pending or cancelled jobs can be deleted',
        400
      )
    }

    // Delete checkpoints first (cascade should handle this but being explicit)
    await sql`DELETE FROM agent_job_checkpoints WHERE job_id = ${id}`

    // Delete job
    await sql`DELETE FROM agent_jobs WHERE id = ${id}`

    return successResponse({ deleted: true, id })
  } catch (error: any) {
    console.error('[API] DELETE /api/agents/jobs/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete job',
      500,
      error.message
    )
  }
}
