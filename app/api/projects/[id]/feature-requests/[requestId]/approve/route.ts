import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  try {
    const { id, requestId } = params

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

    const [featureRequest] = await sql`
      SELECT * FROM feature_requests WHERE id = ${requestId} AND project_id = ${id}
    `

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 })
    }

    const [step] = await sql`
      INSERT INTO project_steps (
        project_id, title, description, status, priority
      ) VALUES (
        ${id}, ${featureRequest.title}, ${featureRequest.description}, 
        'pending', ${featureRequest.priority}
      )
      RETURNING *
    `

    await sql`
      UPDATE feature_requests
      SET status = 'approved', created_step_id = ${step.id}
      WHERE id = ${requestId} AND project_id = ${id}
    `

    return NextResponse.json({ step })
  } catch (error) {
    console.error("Error approving feature request:", error)
    return NextResponse.json({ error: "Failed to approve feature request" }, { status: 500 })
  }
}
