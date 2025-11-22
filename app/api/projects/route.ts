import { sql } from '@/lib/db/client'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/projects
 * Get all projects with stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // Use the project_overview view for optimized data
    let query
    if (status && status !== 'all') {
      query = await sql`
        SELECT * FROM project_overview
        WHERE status = ${status}
        ORDER BY updated_at DESC
      `
    } else {
      query = await sql`
        SELECT * FROM project_overview
        ORDER BY updated_at DESC
      `
    }

    const projects = query

    return NextResponse.json({
      projects,
      count: projects.length,
    })
  } catch (error: any) {
    console.error('Get projects error:', error)
    return NextResponse.json(
      { error: 'Failed to get projects', details: error.message },
      { status: 500 }
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
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
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

    return NextResponse.json({
      success: true,
      project,
    })
  } catch (error: any) {
    console.error('Create project error:', error)
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    )
  }
}
