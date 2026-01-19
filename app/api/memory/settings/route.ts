import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformSettings(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    compression: {
      where: row.where_compression,
      what: row.what_compression,
      how: row.how_compression,
      why: row.why_compression,
      who: row.who_compression,
      when: row.when_compression
    },
    tokenBudget: {
      maxTokensPerRequest: row.max_tokens_per_request,
      autoCompress: row.auto_compress
    },
    retention: {
      decisions: row.retention_decisions,
      lessons: row.retention_lessons,
      activity: row.retention_activity,
      conversations: row.retention_conversations
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/memory/settings
 * Get memory compression and retention settings for the user
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Get existing settings or return defaults
    let settings = await sql`
      SELECT * FROM mlp_compression_settings
      WHERE user_id = ${userId}
    `

    if (settings.length === 0) {
      // Return default settings (not yet created)
      return successResponse({
        userId,
        compression: {
          where: 1,
          what: 1,
          how: 1,
          why: 1,
          who: 1,
          when: 1
        },
        tokenBudget: {
          maxTokensPerRequest: 4000,
          autoCompress: true
        },
        retention: {
          decisions: 0,
          lessons: 0,
          activity: 90,
          conversations: 30
        },
        isDefault: true
      })
    }

    return successResponse(transformSettings(settings[0]))
  } catch (error: any) {
    console.error('[API] GET /api/memory/settings error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get memory settings',
      500,
      error.message
    )
  }
}

/**
 * PUT /api/memory/settings
 * Create or update memory settings
 *
 * Body: {
 *   compression?: {
 *     where?: number (1-5)
 *     what?: number (1-5)
 *     how?: number (1-5)
 *     why?: number (1-5)
 *     who?: number (1-5)
 *     when?: number (1-5)
 *   }
 *   tokenBudget?: {
 *     maxTokensPerRequest?: number
 *     autoCompress?: boolean
 *   }
 *   retention?: {
 *     decisions?: number (days, 0 = forever)
 *     lessons?: number (days, 0 = forever)
 *     activity?: number (days, 0 = forever)
 *     conversations?: number (days, 0 = forever)
 *   }
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()

    const { compression, tokenBudget, retention } = body

    // Validate compression levels
    const compressionLevels = compression || {}
    for (const [key, value] of Object.entries(compressionLevels)) {
      if (value !== undefined && (typeof value !== 'number' || value < 1 || value > 5)) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          `Invalid compression level for ${key}. Must be between 1 and 5`,
          400
        )
      }
    }

    // Validate token budget
    if (tokenBudget?.maxTokensPerRequest !== undefined) {
      if (typeof tokenBudget.maxTokensPerRequest !== 'number' || tokenBudget.maxTokensPerRequest < 100) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Max tokens per request must be at least 100',
          400
        )
      }
    }

    // Validate retention days
    const retentionSettings = retention || {}
    for (const [key, value] of Object.entries(retentionSettings)) {
      if (value !== undefined && (typeof value !== 'number' || value < 0)) {
        return errorResponse(
          ErrorCodes.VALIDATION_ERROR,
          `Invalid retention days for ${key}. Must be 0 or positive`,
          400
        )
      }
    }

    // Upsert settings
    const result = await sql`
      INSERT INTO mlp_compression_settings (
        user_id,
        where_compression,
        what_compression,
        how_compression,
        why_compression,
        who_compression,
        when_compression,
        max_tokens_per_request,
        auto_compress,
        retention_decisions,
        retention_lessons,
        retention_activity,
        retention_conversations
      ) VALUES (
        ${userId},
        ${compressionLevels.where || 1},
        ${compressionLevels.what || 1},
        ${compressionLevels.how || 1},
        ${compressionLevels.why || 1},
        ${compressionLevels.who || 1},
        ${compressionLevels.when || 1},
        ${tokenBudget?.maxTokensPerRequest || 4000},
        ${tokenBudget?.autoCompress !== false},
        ${retentionSettings.decisions || 0},
        ${retentionSettings.lessons || 0},
        ${retentionSettings.activity || 90},
        ${retentionSettings.conversations || 30}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        where_compression = COALESCE(EXCLUDED.where_compression, mlp_compression_settings.where_compression),
        what_compression = COALESCE(EXCLUDED.what_compression, mlp_compression_settings.what_compression),
        how_compression = COALESCE(EXCLUDED.how_compression, mlp_compression_settings.how_compression),
        why_compression = COALESCE(EXCLUDED.why_compression, mlp_compression_settings.why_compression),
        who_compression = COALESCE(EXCLUDED.who_compression, mlp_compression_settings.who_compression),
        when_compression = COALESCE(EXCLUDED.when_compression, mlp_compression_settings.when_compression),
        max_tokens_per_request = COALESCE(EXCLUDED.max_tokens_per_request, mlp_compression_settings.max_tokens_per_request),
        auto_compress = COALESCE(EXCLUDED.auto_compress, mlp_compression_settings.auto_compress),
        retention_decisions = COALESCE(EXCLUDED.retention_decisions, mlp_compression_settings.retention_decisions),
        retention_lessons = COALESCE(EXCLUDED.retention_lessons, mlp_compression_settings.retention_lessons),
        retention_activity = COALESCE(EXCLUDED.retention_activity, mlp_compression_settings.retention_activity),
        retention_conversations = COALESCE(EXCLUDED.retention_conversations, mlp_compression_settings.retention_conversations),
        updated_at = NOW()
      RETURNING *
    `

    return successResponse(transformSettings(result[0]))
  } catch (error: any) {
    console.error('[API] PUT /api/memory/settings error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update memory settings',
      500,
      error.message
    )
  }
}
