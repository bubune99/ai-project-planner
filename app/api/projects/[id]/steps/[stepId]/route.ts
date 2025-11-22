import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const { stepId } = params

    const [step] = await sql`
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
      WHERE ps.id = ${stepId} AND ps.deleted_at IS NULL
      GROUP BY ps.id
    `

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 })
    }

    return NextResponse.json({ step })
  } catch (error) {
    console.error("[v0] Error fetching step:", error)
    return NextResponse.json({ error: "Failed to fetch step" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const { id: projectId, stepId } = params
    const body = await request.json()

    const {
      title,
      description,
      status,
      phase,
      stage,
      estimated_hours,
      actual_hours,
      assigned_agent,
      priority,
      tasks,
      acceptance_criteria,
      progress,
      version_id,
      metadata,
      dependencies,
    } = body

    // Build dynamic update query
    const updates = []
    const values = []

    if (title !== undefined) updates.push(`title = $${updates.length + 1}`), values.push(title)
    if (description !== undefined) updates.push(`description = $${updates.length + 1}`), values.push(description)
    if (status !== undefined) updates.push(`status = $${updates.length + 1}`), values.push(status)
    if (phase !== undefined) updates.push(`phase = $${updates.length + 1}`), values.push(phase)
    if (stage !== undefined) updates.push(`stage = $${updates.length + 1}`), values.push(stage)
    if (estimated_hours !== undefined)
      updates.push(`estimated_hours = $${updates.length + 1}`), values.push(estimated_hours)
    if (actual_hours !== undefined) updates.push(`actual_hours = $${updates.length + 1}`), values.push(actual_hours)
    if (assigned_agent !== undefined)
      updates.push(`assigned_agent = $${updates.length + 1}`), values.push(assigned_agent)
    if (priority !== undefined) updates.push(`priority = $${updates.length + 1}`), values.push(priority)
    if (tasks !== undefined) updates.push(`tasks = $${updates.length + 1}`), values.push(tasks)
    if (acceptance_criteria !== undefined)
      updates.push(`acceptance_criteria = $${updates.length + 1}`), values.push(JSON.stringify(acceptance_criteria))
    if (progress !== undefined) updates.push(`progress = $${updates.length + 1}`), values.push(progress)
    if (version_id !== undefined) updates.push(`version_id = $${updates.length + 1}`), values.push(version_id)
    if (metadata !== undefined) updates.push(`metadata = $${updates.length + 1}`), values.push(JSON.stringify(metadata))

    updates.push(`updated_at = NOW()`)

    if (status === "completed") {
      updates.push(`completed_at = NOW()`)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const [step] = await sql`
      UPDATE project_steps
      SET ${sql.unsafe(updates.join(", "))}
      WHERE id = ${stepId} AND project_id = ${projectId} AND deleted_at IS NULL
      RETURNING *
    `

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 })
    }

    // Update dependencies if provided
    if (dependencies !== undefined) {
      // Remove old dependencies
      await sql`
        DELETE FROM step_dependencies WHERE step_id = ${stepId}
      `

      // Add new dependencies
      for (const dep of dependencies) {
        await sql`
          INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
          VALUES (${stepId}, ${dep.depends_on_step_id}, ${dep.dependency_type || "hard"})
        `
      }
    }

    // Log the update
    await sql`
      INSERT INTO execution_history (
        project_id, step_id, event_type, description, new_value
      )
      VALUES (
        ${projectId}, ${stepId}, 'step_updated',
        ${"Step updated: " + (title || step.title)},
        ${JSON.stringify(body)}
      )
    `

    return NextResponse.json({ step })
  } catch (error) {
    console.error("[v0] Error updating step:", error)
    return NextResponse.json({ error: "Failed to update step" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const { id: projectId, stepId } = params

    // Soft delete
    const [step] = await sql`
      UPDATE project_steps
      SET deleted_at = NOW()
      WHERE id = ${stepId} AND project_id = ${projectId} AND deleted_at IS NULL
      RETURNING *
    `

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 })
    }

    // Log the deletion
    await sql`
      INSERT INTO execution_history (
        project_id, step_id, event_type, description
      )
      VALUES (
        ${projectId}, ${stepId}, 'step_deleted',
        ${"Step deleted: " + step.title}
      )
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error deleting step:", error)
    return NextResponse.json({ error: "Failed to delete step" }, { status: 500 })
  }
}
