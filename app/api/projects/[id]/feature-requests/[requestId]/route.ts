import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string; requestId: string } }) {
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

    const body = await request.json()
    const { status } = body

    const [featureRequest] = await sql`
      UPDATE feature_requests
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${requestId} AND project_id = ${id}
      RETURNING *
    `

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 })
    }

    return NextResponse.json({ request: featureRequest })
  } catch (error) {
    console.error("Error updating feature request:", error)
    return NextResponse.json({ error: "Failed to update feature request" }, { status: 500 })
  }
}
