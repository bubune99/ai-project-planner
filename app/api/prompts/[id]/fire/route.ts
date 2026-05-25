/**
 * POST /api/prompts/[id]/fire
 *
 * Record that a prompt fired for a specific event + entity. Updates prompt
 * counters and inserts a prompt_fires row. Caller can later score outcome
 * via PATCH /api/prompts/[id]/fires/[fireId] (TODO future) or directly via SQL.
 *
 * Body: { fired_for_type, fired_for_id, trigger_event?, check_in_id?, outcome? }
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

const VALID_OUTCOMES = ['pending', 'helpful', 'unhelpful', 'caused_failure', 'unscored'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: promptId } = await params
    const body = await request.json()
    const { fired_for_type, fired_for_id, trigger_event, check_in_id, outcome, outcome_notes } = body

    if (!fired_for_type || !fired_for_id) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'fired_for_type and fired_for_id required',
        400
      )
    }
    const safeOutcome = VALID_OUTCOMES.includes(outcome) ? outcome : 'pending'

    const prompt = await sql`
      SELECT id, version, trigger_event FROM prompts
      WHERE id = ${promptId} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (!prompt.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Prompt not found', 404)

    const fire = await sql`
      INSERT INTO prompt_fires (
        prompt_id, prompt_version, fired_for_type, fired_for_id,
        trigger_event, check_in_id, outcome, outcome_notes, user_id
      ) VALUES (
        ${promptId}, ${prompt[0].version}, ${fired_for_type}, ${fired_for_id},
        ${trigger_event || prompt[0].trigger_event}, ${check_in_id ?? null},
        ${safeOutcome}, ${outcome_notes ?? null}, ${userId}
      )
      RETURNING *
    `

    // Bump prompt counters
    await sql`
      UPDATE prompts
         SET fire_count = fire_count + 1,
             success_count = success_count + ${safeOutcome === 'helpful' ? 1 : 0},
             failure_count = failure_count + ${safeOutcome === 'caused_failure' ? 1 : 0},
             last_fired_at = NOW(),
             updated_at = NOW()
       WHERE id = ${promptId}
    `

    return successResponse(fire[0], undefined, 201)
  } catch (error) {
    console.error('POST /api/prompts/[id]/fire error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to record fire', 500)
  }
}
