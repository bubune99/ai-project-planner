import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!(await verifyProjectOwnership(id, authContext.userId))) {
      return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (!(await verifyCollaboratorAccess(id, authContext.userId, "editor"))) {
      return NextResponse.json({ error: "Forbidden", code: "INSUFFICIENT_PERMISSIONS" }, { status: 403 })
    }

    const body = await request.json()
    const { to_phase, notes } = body

    if (!to_phase) {
      return NextResponse.json(
        { error: "Target phase (to_phase) is required" },
        { status: 400 }
      )
    }

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
