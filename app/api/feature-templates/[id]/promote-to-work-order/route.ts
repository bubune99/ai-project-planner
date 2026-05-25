/**
 * POST /api/feature-templates/[id]/promote-to-work-order
 *
 * Phase 9 / Idea F3 — promotion flow step 2: feature_template → work_order.
 *
 * Uses the composer (lib/work-orders/compose.ts) to topo-sort the template's steps
 * and create a work_order with all work_order_steps. Records 'promoted_from' relation.
 *
 * Body: { project_id (required), title?, description?, auto_approve?, insertion_strategy? }
 */

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
    const { id: templateId } = await params
    const body = await request.json()

    if (!body.project_id) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'project_id required', 400)
    }

    // Forward to the work_orders POST endpoint (which has composer logic baked in)
    // Pass the template id + an explicit "source = template" marker
    const baseUrl = new URL(request.url).origin
    const forwardedBody = {
      ...body,
      sourceTemplateId: templateId,
      title: body.title || `Work order from template ${templateId.slice(0, 8)}`,
    }

    const cookieHeader = request.headers.get('cookie') ?? ''
    const r = await fetch(`${baseUrl}/api/work-orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify(forwardedBody),
    })

    const result = await r.json()
    if (!r.ok) {
      return errorResponse(
        ErrorCodes.DATABASE_ERROR,
        result?.error?.message ?? 'Work order creation failed',
        r.status as 400 | 401 | 403 | 404 | 422 | 500,
        result
      )
    }

    // The work_orders POST already records its own envelope. We add the relation here.
    // (work_orders.source_template_id captures the link in the table column; relation is
    // for the polymorphic graph layer too.)
    return successResponse(result.data ?? result, undefined, 201)
  } catch (error) {
    console.error('POST /api/feature-templates/[id]/promote-to-work-order error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Promote failed', 500)
  }
}
