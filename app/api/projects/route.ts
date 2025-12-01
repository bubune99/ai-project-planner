import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'

/**
 * GET /api/projects
 * Get all projects with stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    console.log('[GET /api/projects] Starting request, status filter:', status)

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      console.error('[GET /api/projects] DATABASE_URL not configured')
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Database not configured',
        503,
        'DATABASE_URL environment variable is missing'
      )
    }

    // Query projects directly
    let query
    if (status && status !== 'all') {
      console.log('[GET /api/projects] Querying with status filter:', status)
      query = await sql`
        SELECT
          p.*,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id), 0) as total_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'completed'), 0) as completed_tasks
        FROM projects p
        WHERE p.status = ${status} AND (p.deleted_at IS NULL)
        ORDER BY p.updated_at DESC
      `
    } else {
      console.log('[GET /api/projects] Querying all projects')
      query = await sql`
        SELECT
          p.*,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id), 0) as total_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'completed'), 0) as completed_tasks
        FROM projects p
        WHERE p.deleted_at IS NULL
        ORDER BY p.updated_at DESC
      `
    }

    const projects = query
    console.log('[GET /api/projects] Successfully retrieved', projects.length, 'projects')

    return successResponse(projects, {
      total: projects.length
    })
  } catch (error: any) {
    console.error('[GET /api/projects] Error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    })
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get projects',
      500,
      error.message
    )
  }
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, priority, start_date, due_date, github_repo_url, metadata } = body

    if (!name) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Project name is required', 400)
    }

    const result = await sql`
      INSERT INTO projects (
        name,
        description,
        priority,
        status,
        start_date,
        due_date,
        github_repo_url,
        metadata
      ) VALUES (
        ${name},
        ${description || null},
        ${priority || 'medium'},
        'planning',
        ${start_date || null},
        ${due_date || null},
        ${github_repo_url || null},
        ${metadata ? JSON.stringify(metadata) : '{}'}
      )
      RETURNING *
    `

    const project = result[0]

    // Create initial ideation phase
    await sql`
      INSERT INTO project_phases (project_id, phase_name, status, description)
      VALUES (
        ${project.id},
        'ideation',
        'active',
        'Initial project ideation and planning'
      )
    `

    // Update project current_phase
    await sql`
      UPDATE projects
      SET current_phase = 'ideation'
      WHERE id = ${project.id}
    `

    return successResponse(project, undefined, 201)
  } catch (error: any) {
    console.error('Create project error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create project',
      500,
      error.message
    )
  }
}
