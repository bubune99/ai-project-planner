/**
 * /api/prompts — Phase 10 / Idea E v2
 *
 * First-class prompt atoms. Fired by work_order check-in loop via
 * matching trigger_event + applies_to_types intersection.
 *
 * GET  list (filters: trigger_event, status, category, search, appliesToType, limit)
 * POST create
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

const VALID_TRIGGERS = [
  'on_step_start',
  'on_step_retry',
  'on_blocker_detected',
  'on_step_completion',
  'on_work_order_completion',
  'on_protocol_violation_detected',
  'on_idea_promotion',
  'on_feature_template_application',
  'on_demand',
] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const sp = new URL(request.url).searchParams
    const trigger = sp.get('trigger_event')
    const status = sp.get('status')
    const search = sp.get('search')
    const appliesToType = sp.get('appliesToType')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '100', 10), 500)

    const rows = await sql`
      SELECT p.*, po.helpfulness_rate, po.helpful_count, po.unhelpful_count, po.fire_count AS view_fire_count
      FROM prompts p
      LEFT JOIN prompt_outcomes po ON po.prompt_id = p.id
      WHERE p.user_id = ${userId}
        AND p.deleted_at IS NULL
        AND (${trigger}::text IS NULL OR p.trigger_event = ${trigger})
        AND (${status}::text IS NULL OR p.status = ${status})
        AND (${search}::text IS NULL OR p.name ILIKE ${'%' + (search ?? '') + '%'} OR p.purpose ILIKE ${'%' + (search ?? '') + '%'} OR p.body ILIKE ${'%' + (search ?? '') + '%'})
        AND (${appliesToType}::text IS NULL OR ${appliesToType} = ANY(p.applies_to_types))
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `
    return successResponse(rows, { total: rows.length })
  } catch (error) {
    console.error('GET /api/prompts error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load prompts', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const body = await request.json()
    const {
      name, purpose, body: promptBody, trigger_event,
      applies_to_types, applies_to_categories, applies_to_skill_names,
      source_type, source_template_id, source_skill_id,
      prompt_references, projectId, visibility,
    } = body

    if (!name?.trim() || !purpose?.trim() || !promptBody?.trim() || !trigger_event) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'name, purpose, body, trigger_event are required',
        400
      )
    }
    if (!VALID_TRIGGERS.includes(trigger_event)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `trigger_event must be one of: ${VALID_TRIGGERS.join(', ')}`,
        400
      )
    }

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: projectId || undefined },
      {
        type: 'prompt',
        title: name,
        summary: purpose,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          `Prompt fires on ${trigger_event}`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    try {
      const result = await sql`
        INSERT INTO prompts (
          name, purpose, body, trigger_event,
          applies_to_types, applies_to_categories, applies_to_skill_names,
          source_type, source_template_id, source_skill_id,
          prompt_references, user_id, project_id, visibility,
          documentation_5wh
        ) VALUES (
          ${name.trim()},
          ${purpose.trim()},
          ${promptBody.trim()},
          ${trigger_event},
          ${applies_to_types ?? []},
          ${applies_to_categories ?? []},
          ${applies_to_skill_names ?? []},
          ${source_type ?? 'user'},
          ${source_template_id ?? null},
          ${source_skill_id ?? null},
          ${prompt_references ? JSON.stringify(prompt_references) : '[]'},
          ${userId},
          ${projectId ?? null},
          ${visibility ?? 'private'},
          ${envelopeForSql(envelopeResult.envelope)}::jsonb
        )
        RETURNING *
      `
      return successResponse(result[0], undefined, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return errorResponse(ErrorCodes.CONFLICT, 'Prompt with this name already exists', 409)
      }
      throw err
    }
  } catch (error) {
    console.error('POST /api/prompts error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create prompt', 500)
  }
}
