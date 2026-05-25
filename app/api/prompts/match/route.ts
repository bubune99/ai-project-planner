/**
 * POST /api/prompts/match
 *
 * Find prompts that match a given event + context. Used by work_order check-in loop
 * to fire JIT prompts (Idea D + Idea E integration).
 *
 * Body: {
 *   trigger_event,        // required
 *   applies_to_type?,     // entity type to match (e.g. 'work_order_step')
 *   applies_to_category?, // optional category filter
 *   skill_names?[],       // skills relevant to current context
 *   limit?                // default 10
 * }
 *
 * Returns matching prompts ranked by helpfulness_rate desc.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const body = await request.json()
    const {
      trigger_event,
      applies_to_type,
      applies_to_category,
      skill_names,
      limit,
    } = body

    if (!trigger_event) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'trigger_event required', 400)
    }
    const cap = Math.min(Number.parseInt(String(limit ?? 10), 10) || 10, 50)

    const rows = await sql`
      SELECT p.*, po.helpfulness_rate, po.fire_count AS view_fire_count
      FROM prompts p
      LEFT JOIN prompt_outcomes po ON po.prompt_id = p.id
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
        AND p.status = 'active'
        AND p.trigger_event = ${trigger_event}
        AND (
          array_length(p.applies_to_types, 1) IS NULL
          OR ${applies_to_type}::text IS NULL
          OR ${applies_to_type} = ANY(p.applies_to_types)
        )
        AND (
          array_length(p.applies_to_categories, 1) IS NULL
          OR ${applies_to_category}::text IS NULL
          OR ${applies_to_category} = ANY(p.applies_to_categories)
        )
        AND (
          array_length(p.applies_to_skill_names, 1) IS NULL
          OR ${skill_names}::text[] IS NULL
          OR p.applies_to_skill_names && ${skill_names}::text[]
        )
      ORDER BY po.helpfulness_rate DESC NULLS LAST, p.fire_count DESC
      LIMIT ${cap}
    `
    return successResponse(rows, { matched: rows.length })
  } catch (error) {
    console.error('POST /api/prompts/match error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Match failed', 500)
  }
}
