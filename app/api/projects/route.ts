import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import type { ProjectSummary } from '@/lib/types'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql, stampEnvelopeOrigin } from '@/lib/api/envelope-helpers'

export const dynamic = "force-dynamic"

/**
 * Transform database row to ProjectSummary format
 * Converts snake_case to camelCase and adds computed fields
 */
function transformToProjectSummary(row: any): ProjectSummary {
  const totalTasks = row.total_tasks || 0
  const completedTasks = row.completed_tasks || 0
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : (row.progress || 0)

  // Compute health based on progress and blocked tasks
  let health: 'excellent' | 'good' | 'attention' | 'critical' = 'good'
  if (row.blocked_tasks > 2) {
    health = 'critical'
  } else if (row.blocked_tasks > 0) {
    health = 'attention'
  } else if (progress > 80) {
    health = 'excellent'
  }

  return {
    id: row.id,
    name: row.name || 'Untitled Project',
    description: row.description,
    status: row.status?.replace('-', '_') || 'planning', // Convert 'in-progress' to 'in_progress'
    phase: row.current_phase || row.phase,
    progress,
    techStack: row.metadata?.techStack || row.tech_stack || [],
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    lastActivity: row.updated_at ? new Date(row.updated_at) : undefined,
    totalTasks,
    completedTasks,
    activeAgents: row.in_progress_tasks || 0, // Use in-progress tasks as proxy for active agents
    health,
  }
}

/**
 * GET /api/projects
 * Get all projects with stats for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    console.log('='.repeat(80))
    console.log('[API GET /api/projects] Starting request')
    console.log('[API] User ID:', userId)
    console.log('[API] Status filter:', status)

    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      console.error('[API] DATABASE_URL not configured')
      return errorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Database not configured',
        503,
        'DATABASE_URL environment variable is missing'
      )
    }

    // Query projects for this user
    let query
    if (status && status !== 'all') {
      // Convert filter status from 'in-progress' format to DB format
      const dbStatus = status.replace('_', '-')
      console.log('[API] Querying with status filter:', dbStatus)
      query = await sql`
        SELECT
          p.*,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id), 0) as total_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'completed'), 0) as completed_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in-progress'), 0) as in_progress_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'blocked'), 0) as blocked_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'pending'), 0) as pending_tasks
        FROM projects p
        WHERE p.user_id = ${userId}
          AND p.status = ${dbStatus}
          AND p.deleted_at IS NULL
        ORDER BY p.updated_at DESC
      `
    } else {
      console.log('[API] Querying all projects')
      query = await sql`
        SELECT
          p.*,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id), 0) as total_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'completed'), 0) as completed_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'in-progress'), 0) as in_progress_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'blocked'), 0) as blocked_tasks,
          COALESCE((SELECT COUNT(*)::int FROM project_steps ps WHERE ps.project_id = p.id AND ps.status = 'pending'), 0) as pending_tasks
        FROM projects p
        WHERE p.user_id = ${userId}
          AND p.deleted_at IS NULL
        ORDER BY p.updated_at DESC
      `
    }

    const rawProjects = query
    console.log('[API] Database query completed successfully')
    console.log('[API] Retrieved', rawProjects.length, 'projects')

    // Transform to ProjectSummary format for frontend
    const projects = rawProjects.map(transformToProjectSummary)

    if (projects.length > 0) {
      console.log('[API] First project sample (transformed):', JSON.stringify(projects[0], null, 2))
      console.log('[API] First project fields:', Object.keys(projects[0]))
    } else {
      console.log('[API] No projects found in database')
    }

    console.log('[API] Response structure:', {
      projectCount: projects.length,
      dataIsArray: Array.isArray(projects),
    })
    console.log('[API] Returning response')
    console.log('='.repeat(80))

    return successResponse(projects, {
      total: projects.length
    })
  } catch (error: any) {
    console.error('='.repeat(80))
    console.error('[API ERROR] Exception caught in GET /api/projects')
    console.error('[API ERROR] Error type:', error.constructor.name)
    console.error('[API ERROR] Error message:', error.message)
    console.error('[API ERROR] Error code:', error.code)
    console.error('[API ERROR] Error detail:', error.detail)
    console.error('[API ERROR] Error stack:', error.stack)
    console.error('='.repeat(80))
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
 * Create a new project for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { name, description, priority, start_date, due_date, github_repo_url, metadata } = body

    if (!name) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Project name is required', 400)
    }

    const result = await sql`
      INSERT INTO projects (
        user_id,
        name,
        description,
        priority,
        status,
        start_date,
        due_date,
        github_repo_url,
        metadata
      ) VALUES (
        ${userId},
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

    // Build 5W+H envelope post-insert so we can use the project's own id as where.project_id.
    // The project row IS the entity — there's no external projectId in the request body.
    const envelopeResult = buildEnvelopeForWrite(
      { ...body, project_id: project.id },
      { userId, projectId: project.id, agentId: undefined },
      {
        type: 'project',
        title: name,
        summary: description || name,
        rationale: body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    // Non-fatal: if envelope fails, log and continue without it (project was already created)
    if (envelopeResult.ok) {
      await sql`
        UPDATE projects
        SET
          documentation_5wh = ${envelopeForSql(envelopeResult.envelope)}::jsonb,
          metadata = ${JSON.stringify(stampEnvelopeOrigin(metadata ?? null, envelopeResult.origin))}::jsonb
        WHERE id = ${project.id}
      `
    }

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
