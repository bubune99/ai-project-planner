/**
 * /api/prompts/[id]
 * GET    full prompt + outcome stats
 * PATCH  update prompt fields
 * DELETE soft delete
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const rows = await sql`
      SELECT p.*, po.helpfulness_rate, po.helpful_count, po.unhelpful_count, po.fire_count AS view_fire_count, po.last_fired_at AS view_last_fired_at
      FROM prompts p
      LEFT JOIN prompt_outcomes po ON po.prompt_id = p.id
      WHERE p.id = ${id} AND p.user_id = ${userId} AND p.deleted_at IS NULL
    `
    if (!rows.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Prompt not found', 404)
    return successResponse(rows[0])
  } catch (error) {
    console.error('GET /api/prompts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load prompt', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const body = await request.json()

    const existing = await sql`
      SELECT * FROM prompts
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (!existing.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Prompt not found', 404)

    const mergeResult = mergeEnvelopeForPatch(
      existing[0].documentation_5wh,
      body,
      { userId, projectId: existing[0].project_id || undefined },
      {
        type: 'prompt',
        title: body.name ?? existing[0].name,
        summary: body.purpose ?? existing[0].purpose,
        rationale:
          body?.documentation_5wh?.why?.rationale ?? 'Updated via PATCH',
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    const merged = {
      name: body.name ?? existing[0].name,
      purpose: body.purpose ?? existing[0].purpose,
      body: body.body ?? existing[0].body,
      trigger_event: body.trigger_event ?? existing[0].trigger_event,
      applies_to_types: body.applies_to_types ?? existing[0].applies_to_types,
      applies_to_categories: body.applies_to_categories ?? existing[0].applies_to_categories,
      applies_to_skill_names: body.applies_to_skill_names ?? existing[0].applies_to_skill_names,
      status: body.status ?? existing[0].status,
      prompt_references: body.prompt_references ?? existing[0].prompt_references,
    }

    const result = await sql`
      UPDATE prompts
         SET name = ${merged.name},
             purpose = ${merged.purpose},
             body = ${merged.body},
             trigger_event = ${merged.trigger_event},
             applies_to_types = ${merged.applies_to_types},
             applies_to_categories = ${merged.applies_to_categories},
             applies_to_skill_names = ${merged.applies_to_skill_names},
             status = ${merged.status},
             prompt_references = ${typeof merged.prompt_references === 'string' ? merged.prompt_references : JSON.stringify(merged.prompt_references)}::jsonb,
             documentation_5wh = ${envelopeForSql(mergeResult.envelope)}::jsonb,
             updated_at = NOW()
       WHERE id = ${id} AND user_id = ${userId}
       RETURNING *
    `
    return successResponse(result[0])
  } catch (error) {
    console.error('PATCH /api/prompts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update prompt', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const r = await sql`
      UPDATE prompts SET deleted_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `
    if (!r.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Prompt not found', 404)
    return successResponse({ id: r[0].id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/prompts/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete prompt', 500)
  }
}
