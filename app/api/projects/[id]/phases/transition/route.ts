import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { to_phase, notes } = body

    await sql`
      UPDATE project_phases
      SET status = 'completed', exit_date = NOW(), exit_criteria_met = true
      WHERE project_id = ${id} AND status = 'active'
    `

    const [newPhase] = await sql`
      INSERT INTO project_phases (project_id, phase, status, notes)
      VALUES (${id}, ${to_phase}, 'active', ${notes || null})
      RETURNING *
    `

    await sql`
      UPDATE projects
      SET current_phase = ${to_phase}
      WHERE id = ${id}
    `

    return NextResponse.json({ phase: newPhase })
  } catch (error) {
    console.error("Error transitioning phase:", error)
    return NextResponse.json({ error: "Failed to transition phase" }, { status: 500 })
  }
}
