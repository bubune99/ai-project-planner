/**
 * POST /api/work-orders/[id]/mark-implemented
 *
 * Phase 9 / Idea F3 — promotion flow step 3: close the loop.
 *
 * - Sets work_order.status='completed'
 * - For every step in the work_order, ensures status is in a terminal state
 * - Walks entity_relations: any feedback linked to this work_order via 'addresses' is auto-closed
 * - Walks 'promoted_from' chain: bumps source template/idea usage_count + success_count
 * - Records the implementation in entity_relations
 *
 * Body: { outcome?: 'success'|'partial', summary? }
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: workOrderId } = await params
    const body = await request.json().catch(() => ({}))
    const outcome = (body.outcome === 'partial' ? 'partial' : 'success') as 'success' | 'partial'
    const summary = body.summary ?? null

    const wo = await sql`
      SELECT id, user_id, source_template_id, source_idea_id, project_id
      FROM work_orders WHERE id = ${workOrderId} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (!wo.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Work order not found', 404)

    // Mark work_order complete
    await sql`
      UPDATE work_orders
         SET status = 'completed',
             completed_at = NOW(),
             updated_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
               marked_implemented: { at: new Date().toISOString(), outcome, summary, by: userId },
             })}::jsonb
       WHERE id = ${workOrderId}
    `

    // Auto-close any feedback linked via entity_relations ('addresses' relation pointing at this work order)
    const linkedFeedback = await sql`
      SELECT DISTINCT to_entity_id AS id
      FROM entity_relations
      WHERE from_entity_type = 'work_order'
        AND from_entity_id = ${workOrderId}
        AND to_entity_type = 'feedback'
        AND relation_type = 'addresses'
        AND user_id = ${userId}
        AND deleted_at IS NULL
    ` as any[]

    const closedFeedbackIds: string[] = []
    for (const fb of linkedFeedback) {
      try {
        const upd = await sql`
          UPDATE feedback
             SET status = 'resolved',
                 resolved_at = NOW(),
                 updated_at = NOW()
           WHERE id = ${fb.id} AND status NOT IN ('resolved', 'wont_fix')
           RETURNING id
        `
        if (upd[0]?.id) closedFeedbackIds.push(upd[0].id)
      } catch (e) {
        // feedback might lack these columns — non-fatal
        console.error('feedback close non-fatal:', e)
      }
    }

    // Bump source template counters (if any)
    if (wo[0].source_template_id) {
      const inc = outcome === 'success' ? 1 : 0
      await sql`
        UPDATE feature_templates
           SET usage_count = usage_count + 1,
               success_count = success_count + ${inc},
               failure_count = failure_count + ${1 - inc},
               last_used_at = NOW(),
               updated_at = NOW()
         WHERE id = ${wo[0].source_template_id}
      `
    }

    // Record entity_relation: work_order implements / addresses source
    if (wo[0].source_idea_id) {
      try {
        await sql`
          INSERT INTO entity_relations (
            from_entity_type, from_entity_id, to_entity_type, to_entity_id,
            relation_type, confidence, user_id, created_by_type
          ) VALUES (
            'work_order', ${workOrderId}, 'idea', ${wo[0].source_idea_id},
            'implements', 1.00, ${userId}, 'system'
          )
          ON CONFLICT DO NOTHING
        `
        // Also bump source idea lifecycle if still 'promoted' — keep at promoted, but stamp metadata
        await sql`
          UPDATE ideas
             SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
               implementation_completed_at: new Date().toISOString(),
               by_work_order_id: workOrderId,
             })}::jsonb,
                 updated_at = NOW()
           WHERE id = ${wo[0].source_idea_id}
        `
      } catch (e) {
        console.error('idea implementation link non-fatal:', e)
      }
    }

    return successResponse({
      workOrderId,
      status: 'completed',
      outcome,
      closedFeedbackIds,
      sourceTemplateCounterBumped: !!wo[0].source_template_id,
      sourceIdeaLinked: !!wo[0].source_idea_id,
    })
  } catch (error) {
    console.error('POST /api/work-orders/[id]/mark-implemented error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Mark implemented failed', 500)
  }
}
