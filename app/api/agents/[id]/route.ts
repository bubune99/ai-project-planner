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
    description: row.description,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt,
    status: row.status,
    currentTaskId: row.current_task_id,
    lastActiveAt: row.last_active_at,
    lastHeartbeat: row.last_heartbeat,
    capabilities: row.capabilities || {},
    tools: row.tools || [],
    memoryAccess: row.memory_access || [],
    totalConversations: row.total_conversations || 0,
    totalTokensUsed: row.total_tokens_used || 0,
    totalCost: row.total_cost || 0,
    isExternal: row.is_external || false,
    permissions: row.permissions || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Include task info if joined
    currentTask: row.task_title ? {
      id: row.current_task_id,
      title: row.task_title,
      status: row.task_status
    } : null,
    // Include recent conversations if joined
    recentConversations: row.recent_conversations || null
  }
}

/**
 * GET /api/agents/[id]
 * Get a specific agent by ID or name
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeTask = searchParams.get('includeTask') === 'true'
    const includeConversations = searchParams.get('includeConversations') === 'true'

    // Try to find by ID first, then by name
    let agent
    if (includeTask) {
      agent = await sql`
        SELECT
          a.*,
          ps.title as task_title,
          ps.status as task_status
        FROM agents a
        LEFT JOIN project_steps ps ON a.current_task_id = ps.id
        WHERE a.id::text = ${id} OR a.name = ${id}
        LIMIT 1
      `
    } else {
      agent = await sql`
        SELECT * FROM agents
        WHERE id::text = ${id} OR name = ${id}
        LIMIT 1
      `
    }

    if (agent.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Agent not found', 404)
    }

    const result = transformAgent(agent[0])

    // Optionally include recent conversations
    if (includeConversations) {
      const conversations = await sql`
        SELECT id, title, status, context_type, message_count, updated_at
        FROM ai_conversations
        WHERE metadata->>'agentId' = ${agent[0].id}::text
        ORDER BY updated_at DESC
        LIMIT 10
      `
      result.recentConversations = conversations.map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        contextType: c.context_type,
        messageCount: c.message_count,
        updatedAt: c.updated_at
      }))
    }

    return successResponse(result)
  } catch (error: any) {
    console.error('[API] GET /api/agents/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get agent',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/agents/[id]
 * Update a specific agent
 *
 * Body: {
 *   description?: string
 *   provider?: string
 *   model?: string
 *   systemPrompt?: string
 *   status?: "active" | "idle" | "working" | "error" | "offline"
 *   currentTaskId?: UUID | null
 *   capabilities?: object
 *   tools?: string[]
 *   memoryAccess?: string[]
 *   permissions?: object
 *   metadata?: object
 * }
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

    const { id } = await params
    const body = await request.json()
    const {
      description,
      provider,
      model,
      systemPrompt,
      status,
      currentTaskId,
      capabilities,
      tools,
      memoryAccess,
      permissions,
      metadata
    } = body

    // Validate status if provided
    const validStatuses = ['active', 'idle', 'working', 'error', 'offline', 'busy', 'online']
    if (status && !validStatuses.includes(status)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400
      )
    }

    // Check agent exists
    const existing = await sql`
      SELECT id FROM agents
      WHERE id::text = ${id} OR name = ${id}
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Agent not found', 404)
    }

    const agentId = existing[0].id

    // Build update query dynamically
    const result = await sql`
      UPDATE agents
      SET
        description = COALESCE(${description ?? null}, description),
        provider = COALESCE(${provider ?? null}, provider),
        model = COALESCE(${model ?? null}, model),
        system_prompt = COALESCE(${systemPrompt ?? null}, system_prompt),
        status = COALESCE(${status ?? null}, status),
        current_task_id = ${currentTaskId === null ? null : (currentTaskId ?? null)},
        capabilities = COALESCE(${capabilities ? JSON.stringify(capabilities) : null}, capabilities),
        tools = COALESCE(${tools ? JSON.stringify(tools) : null}, tools),
        memory_access = COALESCE(${memoryAccess ? JSON.stringify(memoryAccess) : null}, memory_access),
        permissions = COALESCE(${permissions ? JSON.stringify(permissions) : null}, permissions),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}, metadata),
        last_active_at = NOW(),
        updated_at = NOW()
      WHERE id = ${agentId}
      RETURNING *
    `

    return successResponse(transformAgent(result[0]))
  } catch (error: any) {
    console.error('[API] PATCH /api/agents/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update agent',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/agents/[id]
 * Delete an agent (only for custom/external agents, not built-in)
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

    const { id } = await params

    // Check agent exists and get details
    const existing = await sql`
      SELECT id, name, is_external FROM agents
      WHERE id::text = ${id} OR name = ${id}
    `

    if (existing.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Agent not found', 404)
    }

    const agent = existing[0]

    // Don't allow deleting built-in agents
    const builtInAgents = ['v0', 'claude', 'gemini', 'gpt']
    if (builtInAgents.includes(agent.name) && !agent.is_external) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Cannot delete built-in agents',
        400
      )
    }

    // Delete the agent
    await sql`
      DELETE FROM agents WHERE id = ${agent.id}
    `

    return successResponse({ deleted: true, id: agent.id, name: agent.name })
  } catch (error: any) {
    console.error('[API] DELETE /api/agents/[id] error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete agent',
      500,
      error.message
    )
  }
}
