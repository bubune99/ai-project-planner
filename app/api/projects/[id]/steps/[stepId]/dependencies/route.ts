import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"

export const dynamic = "force-dynamic"

/**
 * True only when every given step id is a live step of the given project.
 * Stops a caller with access to project A from linking or unlinking steps
 * that belong to project B via A's URL.
 */
async function stepsBelongToProject(projectId: string, stepIds: string[]): Promise<boolean> {
  const unique = Array.from(new Set(stepIds))
  const rows = (await sql`
    SELECT id FROM project_steps
    WHERE project_id = ${projectId}
      AND deleted_at IS NULL
      AND id = ANY(${unique})
  `) as Record<string, unknown>[]
  return rows.length === unique.length
}

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!(await verifyProjectOwnership(params.id, authContext.userId))) {
      return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (!(await verifyCollaboratorAccess(params.id, authContext.userId, "editor"))) {
      return NextResponse.json({ error: "Forbidden", code: "INSUFFICIENT_PERMISSIONS" }, { status: 403 })
    }

    const { dependsOnId } = await request.json()

    if (typeof dependsOnId !== "string" || dependsOnId.length === 0) {
      return NextResponse.json({ error: "dependsOnId is required" }, { status: 400 })
    }
    if (!(await stepsBelongToProject(params.id, [params.stepId, dependsOnId]))) {
      return NextResponse.json({ error: "Step not found", code: "NOT_FOUND" }, { status: 404 })
    }

    await sql`
      INSERT INTO project_step_dependencies (step_id, depends_on_id)
      VALUES (${params.stepId}, ${dependsOnId})
      ON CONFLICT (step_id, depends_on_id) DO NOTHING
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to create dependency:", error)
    return NextResponse.json({ error: "Failed to create dependency" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!(await verifyProjectOwnership(params.id, authContext.userId))) {
      return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (!(await verifyCollaboratorAccess(params.id, authContext.userId, "editor"))) {
      return NextResponse.json({ error: "Forbidden", code: "INSUFFICIENT_PERMISSIONS" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dependsOnId = searchParams.get("dependsOnId")

    if (typeof dependsOnId !== "string" || dependsOnId.length === 0) {
      return NextResponse.json({ error: "dependsOnId is required" }, { status: 400 })
    }
    if (!(await stepsBelongToProject(params.id, [params.stepId, dependsOnId]))) {
      return NextResponse.json({ error: "Step not found", code: "NOT_FOUND" }, { status: 404 })
    }

    await sql`
      DELETE FROM project_step_dependencies
      WHERE step_id = ${params.stepId} AND depends_on_id = ${dependsOnId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete dependency:", error)
    return NextResponse.json({ error: "Failed to delete dependency" }, { status: 500 })
  }
}
