import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id: projectId } = params

    const steps = await sql`
      SELECT 
        ps.*,
        COALESCE(
          json_agg(
            json_build_object('depends_on_step_id', sd.depends_on_step_id, 'dependency_type', sd.dependency_type)
          ) FILTER (WHERE sd.id IS NOT NULL),
          '[]'::json
        ) as dependencies
      FROM project_steps ps
      LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
      WHERE ps.project_id = ${projectId}
        AND ps.deleted_at IS NULL
      GROUP BY ps.id
      ORDER BY ps.order_index ASC, ps.created_at ASC
    `

    return NextResponse.json({ steps })
  } catch (error) {
    console.error("[v0] Error fetching steps:", error)
    return NextResponse.json({ error: "Failed to fetch steps" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id: projectId } = params
    const body = await request.json()

    const {
      title,
      description,
      phase,
      stage,
      estimated_hours,
      assigned_agent,
      priority = "medium",
      tasks = [],
      acceptance_criteria = {},
      dependencies = [],
      version_id,
      metadata = {},
    } = body

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    // Get the max order_index to append at the end
    const [maxOrder] = await sql`
      SELECT COALESCE(MAX(order_index), 0) as max_order
      FROM project_steps
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `

    // Create the step
    const [step] = await sql`
      INSERT INTO project_steps (
        project_id, title, description, phase, stage,
        estimated_hours, assigned_agent, priority, tasks,
        acceptance_criteria, version_id, metadata, order_index
      )
      VALUES (
        ${projectId}, ${title}, ${description || null}, ${phase || null}, ${stage || null},
        ${estimated_hours || null}, ${assigned_agent || null}, ${priority}, ${tasks},
        ${JSON.stringify(acceptance_criteria)}, ${version_id || null}, 
        ${JSON.stringify(metadata)}, ${(maxOrder.max_order || 0) + 1}
      )
      RETURNING *
    `

    // Add dependencies if provided
    if (dependencies.length > 0) {
      for (const dep of dependencies) {
        await sql`
          INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
          VALUES (${step.id}, ${dep.depends_on_step_id}, ${dep.dependency_type || "hard"})
        `
      }
    }

    // Log the creation
    await sql`
      INSERT INTO execution_history (
        project_id, step_id, event_type, description, new_value
      )
      VALUES (
        ${projectId}, ${step.id}, 'step_created', 
        ${"Step created: " + title},
        ${JSON.stringify({ step_id: step.id, title })}
      )
    `

    return NextResponse.json({ step }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating step:", error)
    return NextResponse.json({ error: "Failed to create step" }, { status: 500 })
  }
}
