import { sql } from '@/lib/db/client'
import { NextRequest, NextResponse } from 'next/server'
import { successResponse, errorResponse } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'
import { isUuid } from '@/lib/api/ids'
import { databaseUnavailableResponse } from '@/lib/db/unavailable'

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]
 * Get project details with all related data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    if (!isUuid(id)) return errorResponse('NOT_FOUND', 'Project not found', 404)

    // Verify ownership
    const hasAccess = await verifyProjectOwnership(id, userId)
    if (!hasAccess) {
      return errorResponse('NOT_FOUND', 'Project not found', 404)
    }

    // Get project overview (querying table directly to bypass view issues)
    const projectResult = await sql`
      SELECT
        p.*,
        (SELECT count(*) FROM project_steps ps WHERE ps.project_id = p.id AND ps.deleted_at IS NULL) as total_tasks,
        (SELECT count(*) FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'completed' AND ps.deleted_at IS NULL) as completed_tasks,
        (SELECT count(*) FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in-progress' AND ps.deleted_at IS NULL) as in_progress_tasks,
        (SELECT count(*) FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'blocked' AND ps.deleted_at IS NULL) as blocked_tasks,
        (SELECT count(*) FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'pending' AND ps.deleted_at IS NULL) as pending_tasks,
        (SELECT phase FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in-progress' AND ps.deleted_at IS NULL ORDER BY order_index LIMIT 1) as current_phase_name,
        (SELECT jsonb_agg(ts.name ORDER BY ts.order_index) FROM tech_stack_items ts WHERE ts.project_id = p.id AND ts.deleted_at IS NULL) as tech_stack_names,
        (SELECT created_at FROM execution_history eh WHERE eh.project_id = p.id ORDER BY created_at DESC LIMIT 1) as last_activity
      FROM projects p
      WHERE p.id = ${id}
        AND p.deleted_at IS NULL
    `
    // Access was decided above (owner or accepted collaborator), so the record is read by id alone:
    // filtering on the owner here told a collaborator their shared project did not exist.

    if (!projectResult || projectResult.length === 0) {
      return NextResponse.json({
        error: 'Project not found'
      }, { status: 404 })
    }

    const project = projectResult[0]

    // Get project steps
    const steps = await sql`
      SELECT * FROM project_execution
      WHERE project_id = ${id}
      ORDER BY order_index
    `

    // Get tech stack
    const techStack = await sql`
      SELECT * FROM tech_stack_documentation
      WHERE project_id = ${id}
      ORDER BY order_index
    `

    // Get business context
    const businessContext = await sql`
      SELECT * FROM business_context
      WHERE project_id = ${id}
    `

    // Get current phase
    const currentPhase = await sql`
      SELECT * FROM project_phases
      WHERE project_id = ${id}
        AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `

    // Get recent progress notes
    const progressNotes = await sql`
      SELECT * FROM get_recent_progress(${id}::UUID, 20)
    `

    // Get project versions
    const versions = await sql`
      SELECT * FROM project_versions
      WHERE project_id = ${id}
      ORDER BY created_at DESC
    `

    return successResponse({
      project,
      steps,
      techStack,
      businessContext: businessContext[0] || null,
      currentPhase: currentPhase[0] || null,
      progressNotes,
      versions,
    })
  } catch (error: any) {
    const down = databaseUnavailableResponse(error)
    if (down) return down
    console.error('Get project error:', error)
    return errorResponse('INTERNAL_ERROR', 'Failed to get project', 500, error.message)
  }
}

/**
 * PATCH /api/projects/[id]
 * Update project details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    if (!isUuid(id)) return errorResponse('NOT_FOUND', 'Project not found', 404)

    // Verify ownership
    const hasAccess = await verifyProjectWriteAccess(id, userId)
    if (!hasAccess) {
      return errorResponse('NOT_FOUND', 'Project not found', 404)
    }

    const body = await request.json()
    const { name, description, status, priority, due_date, github_repo_url } = body
    let metadata = body.metadata
    // The page's settings record (metadata.planner_ui) is written whole. A save says which revision it started from
    // (expectedUiRev) and is refused if another tab or an agent saved since (Money and Settings checks, 2026-11-15:
    // two tabs could overwrite each other with no warning). The server owns the counter.
    const expectedUiRev: number | null = Number.isInteger(body.expectedUiRev) ? body.expectedUiRev : null
    if (expectedUiRev !== null && metadata && typeof metadata === 'object') {
      metadata = { ...metadata, planner_ui: { ...((metadata as any).planner_ui || {}), _rev: expectedUiRev + 1 } }
    }
    // A field that was sent empty is being cleared; a field that was not sent is left alone. Before this, an emptied
    // description, target date or repository link was answered with "saved" and the old value stayed.
    const sent = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
    // Tags can be edited on Settings (2026-11-16; they were "set by agents" only): trimmed, short, unique, at most 30.
    const tags: string[] | null = Array.isArray(body.tags)
      ? [...new Set((body.tags as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 30)
      : null

    // Fetch existing envelope for merge
    const existingProject = await sql`SELECT documentation_5wh FROM projects WHERE id = ${id} AND user_id = ${userId}`
    const mergeResult = mergeEnvelopeForPatch(
      existingProject[0]?.documentation_5wh,
      body,
      { userId, projectId: id, agentId: undefined },
      {
        type: 'project',
        title: name || undefined,
        summary: description || body.summary,
        rationale: body?.documentation_5wh?.why?.rationale || 'Update via PATCH /api/projects/[id]',
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    const result = await sql`
      UPDATE projects
      SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${typeof description === 'string' ? description : null}, description),
        status = COALESCE(${status || null}, status),
        priority = COALESCE(${priority || null}, priority),
        due_date = CASE WHEN ${sent('due_date')}::boolean THEN ${due_date || null}::timestamp ELSE due_date END,
        github_repo_url = CASE WHEN ${sent('github_repo_url')}::boolean THEN ${typeof github_repo_url === 'string' && github_repo_url.trim() ? github_repo_url.trim() : null} ELSE github_repo_url END,
        -- Without expectedUiRev a save may change other metadata (risks, for one) but never the settings record:
        -- the stored planner_ui is kept, so a whole-metadata write from an old copy cannot wipe it.
        metadata = COALESCE(
          ${metadata ? JSON.stringify(metadata) : null}::jsonb
            || CASE WHEN ${expectedUiRev}::int IS NULL THEN jsonb_strip_nulls(jsonb_build_object('planner_ui', metadata->'planner_ui')) ELSE '{}'::jsonb END,
          metadata),
        tags = COALESCE(${tags}::text[], tags),
        documentation_5wh = ${envelopeForSql(mergeResult.envelope)}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}
        AND user_id = ${userId}
        AND (${expectedUiRev}::int IS NULL OR COALESCE((metadata->'planner_ui'->>'_rev')::int, 0) = ${expectedUiRev}::int)
      RETURNING *
    `

    if (result.length === 0) {
      if (expectedUiRev !== null) {
        const [exists] = await sql`SELECT 1 FROM projects WHERE id = ${id} AND user_id = ${userId}`
        if (exists) {
          return NextResponse.json(
            { error: 'This project was changed in another tab or by an agent since you opened it. The page now shows the latest; make your change again.', code: 'STALE' },
            { status: 409 }
          )
        }
      }
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      project: result[0],
    })
  } catch (error: unknown) {
    console.error('Update project error:', error)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/projects/[id]
 * Soft delete a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
    }

    const { userId } = authContext
    const { id } = await params
    if (!isUuid(id)) return errorResponse('NOT_FOUND', 'Project not found', 404)

    // Verify ownership
    const hasAccess = await verifyProjectWriteAccess(id, userId)
    if (!hasAccess) {
      return errorResponse('NOT_FOUND', 'Project not found', 404)
    }

    const result = await sql`
      UPDATE projects
      SET deleted_at = NOW()
      WHERE id = ${id}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
    })
  } catch (error: unknown) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}
