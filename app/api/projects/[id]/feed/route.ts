/**
 * /api/projects/[id]/feed
 *
 * GET — unified "Recent activity" feed for a project, newest first.
 *
 * The old Overview feed read only progress_notes (via get_recent_progress),
 * which went stale because the platform's real activity now flows through
 * work_order_check_ins and todos. This endpoint unions the live sources:
 *   - work_order_check_ins  (agent claim/progress/blocker/completion events)
 *   - todos                 (creation + completion)
 *   - progress_notes        (legacy human/agent notes, still supported)
 *
 * Distinct from /api/projects/[id]/activity, which is the collaboration
 * audit log (human collaborators only). This is the cross-source work feed.
 *
 * Scoped by project ownership. Every branch filters by project_id so a
 * caller only ever sees activity for a project they can access.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const hasAccess = await verifyProjectOwnership(params.id, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Project not found', 404)
    }

    const sp = new URL(request.url).searchParams
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '20', 10) || 20, 100)

    const rows = (await sql`
      WITH feed AS (
        -- Work-order check-ins: the agent's live event stream
        SELECT
          ci.id::text                    AS id,
          'checkin'                      AS source,
          ci.event_type                  AS kind,
          COALESCE(wos.title, wo.title)  AS title,
          ci.message                     AS detail,
          ci.by_id                       AS actor,
          ci.by_type                     AS actor_type,
          wo.title                       AS context,
          'work_order'                   AS ref_type,
          ci.work_order_id::text         AS ref_id,
          ci.created_at::timestamptz     AS ts
        FROM work_order_check_ins ci
        JOIN work_orders wo ON wo.id = ci.work_order_id
        LEFT JOIN work_order_steps wos ON wos.id = ci.step_id
        WHERE wo.project_id = ${params.id}
          AND wo.deleted_at IS NULL

        UNION ALL

        -- Todo creations
        SELECT
          ('todo-new-' || t.id::text)    AS id,
          'todo'                         AS source,
          'created'                      AS kind,
          t.title                        AS title,
          t.description                  AS detail,
          NULL                           AS actor,
          'user'                         AS actor_type,
          NULL                           AS context,
          'todo'                         AS ref_type,
          t.id::text                     AS ref_id,
          t.created_at::timestamptz      AS ts
        FROM todos t
        WHERE t.project_id = ${params.id}
          AND t.deleted_at IS NULL

        UNION ALL

        -- Todo completions
        SELECT
          ('todo-done-' || t.id::text)   AS id,
          'todo'                         AS source,
          'completed'                    AS kind,
          t.title                        AS title,
          t.description                  AS detail,
          NULL                           AS actor,
          'user'                         AS actor_type,
          NULL                           AS context,
          'todo'                         AS ref_type,
          t.id::text                     AS ref_id,
          t.completed_at::timestamptz    AS ts
        FROM todos t
        WHERE t.project_id = ${params.id}
          AND t.deleted_at IS NULL
          AND t.completed_at IS NOT NULL

        UNION ALL

        -- Legacy progress notes
        SELECT
          ('note-' || pn.id::text)       AS id,
          'note'                         AS source,
          pn.note_type                   AS kind,
          COALESCE(pn.title, 'Update')   AS title,
          pn.content                     AS detail,
          pn.author_name                 AS actor,
          pn.author_type                 AS actor_type,
          NULL                           AS context,
          'note'                         AS ref_type,
          pn.id::text                    AS ref_id,
          pn.created_at::timestamptz     AS ts
        FROM progress_notes pn
        WHERE pn.project_id = ${params.id}
      )
      SELECT * FROM feed
      WHERE ts IS NOT NULL
      ORDER BY ts DESC
      LIMIT ${limit}
    `) as Record<string, unknown>[]

    return successResponse(rows, { total: rows.length, limit })
  } catch (error) {
    console.error('GET /api/projects/[id]/feed error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load activity feed', 500)
  }
}
