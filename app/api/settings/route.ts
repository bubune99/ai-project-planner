import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings
 * Get all user settings and preferences
 *
 * Returns:
 * - User profile info
 * - Memory compression settings
 * - UI preferences (if stored)
 * - Notification preferences (if stored)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Get user profile
    const users = await sql`
      SELECT id, email, name, avatar_url, created_at, updated_at
      FROM users
      WHERE id = ${userId}
    `

    if (users.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'User not found', 404)
    }

    const user = users[0]

    // Get memory compression settings
    const memorySettings = await sql`
      SELECT * FROM mlp_compression_settings
      WHERE user_id = ${userId}
    `

    // Get counts for overview
    const projectCount = await sql`
      SELECT COUNT(*) as count FROM projects
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `

    const todoCount = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completed' AND deleted_at IS NULL) as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) as completed
      FROM todos
      WHERE user_id = ${userId}
    `

    const apiKeyCount = await sql`
      SELECT COUNT(*) as count FROM api_keys
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `

    // Build settings response
    const settings = {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      memory: memorySettings[0] ? {
        compression: {
          where: memorySettings[0].where_compression,
          what: memorySettings[0].what_compression,
          how: memorySettings[0].how_compression,
          why: memorySettings[0].why_compression,
          who: memorySettings[0].who_compression,
          when: memorySettings[0].when_compression
        },
        tokenBudget: {
          maxTokensPerRequest: memorySettings[0].max_tokens_per_request,
          autoCompress: memorySettings[0].auto_compress
        },
        retention: {
          decisions: memorySettings[0].retention_decisions,
          lessons: memorySettings[0].retention_lessons,
          activity: memorySettings[0].retention_activity,
          conversations: memorySettings[0].retention_conversations
        }
      } : null,
      stats: {
        projects: parseInt(projectCount[0]?.count || '0'),
        todos: {
          active: parseInt(todoCount[0]?.active || '0'),
          completed: parseInt(todoCount[0]?.completed || '0')
        },
        apiKeys: parseInt(apiKeyCount[0]?.count || '0')
      }
    }

    return successResponse(settings)
  } catch (error: any) {
    console.error('[API] GET /api/settings error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get settings',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/settings
 * Update user profile settings
 *
 * Body: {
 *   name?: string
 *   avatarUrl?: string
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()

    const { name, avatarUrl } = body

    // Validate name if provided
    if (name !== undefined && (!name || typeof name !== 'string' || name.trim().length === 0)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Name cannot be empty', 400)
    }

    // Update user profile
    const result = await sql`
      UPDATE users
      SET
        name = COALESCE(${name?.trim() || null}, name),
        avatar_url = COALESCE(${avatarUrl || null}, avatar_url),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, name, avatar_url, created_at, updated_at
    `

    if (result.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'User not found', 404)
    }

    const user = result[0]

    return successResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    })
  } catch (error: any) {
    console.error('[API] PATCH /api/settings error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update settings',
      500,
      error.message
    )
  }
}
