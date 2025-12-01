import { sql } from '@/lib/db/client'
import { NextRequest, NextResponse } from 'next/server'
import { successResponse, errorResponse } from '@/lib/api-utils'

/**
 * GET /api/projects/[id]
 * Get project details with all related data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params) // Handle both object and Promise

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
      WHERE p.id = ${id} AND p.deleted_at IS NULL
    `
    console.log('Project ID:', id)

    if (!projectResult || projectResult.length === 0) {
      return NextResponse.json({
        error: 'Project not found',
        receivedId: id,
        dbUrl: process.env.DATABASE_URL ? 'Set' : 'Not Set'
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

    return NextResponse.json(successResponse({
      project,
      steps,
      techStack,
      businessContext: businessContext[0] || null,
      currentPhase: currentPhase[0] || null,
      progressNotes,
      versions,
    }))
  } catch (error: any) {
    console.error('Get project error:', error)
    return NextResponse.json(
      errorResponse('INTERNAL_ERROR', 'Failed to get project', 500, error.message),
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/projects/[id]
 * Update project details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params)
    const body = await request.json()
    const { name, description, status, priority, due_date, github_repo_url, metadata } = body

    const result = await sql`
      UPDATE projects
      SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        status = COALESCE(${status || null}, status),
        priority = COALESCE(${priority || null}, priority),
        due_date = COALESCE(${due_date || null}, due_date),
        github_repo_url = COALESCE(${github_repo_url || null}, github_repo_url),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      project: result[0],
    })
  } catch (error: any) {
    console.error('Update project error:', error)
    return NextResponse.json(
      { error: 'Failed to update project', details: error.message },
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params)
    const result = await sql`
      UPDATE projects
      SET deleted_at = NOW()
      WHERE id = ${id}
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
  } catch (error: any) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: 'Failed to delete project', details: error.message },
      { status: 500 }
    )
  }
}
