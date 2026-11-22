import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"
import { isUuid } from "@/lib/api/ids"

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

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string; stepId: string }> }
) {
  const params = await props.params;
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!isUuid(params.id)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    if (!isUuid(params.stepId)) return NextResponse.json({ error: "Step not found", code: "NOT_FOUND" }, { status: 404 })
    if (!(await verifyProjectWriteAccess(params.id, authContext.userId))) {
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

    if (params.stepId === dependsOnId) {
      return NextResponse.json({ error: "A step cannot wait on itself" }, { status: 400 })
    }
    // step_dependencies is the table every view reads; project_step_dependencies never existed, so every call here
    // failed with a 500 (review 2026-10-08, card d81ee324).
    await sql`
      INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
      VALUES (${params.stepId}, ${dependsOnId}, 'hard')
      ON CONFLICT (step_id, depends_on_step_id) DO UPDATE SET deleted_at = NULL
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to create dependency:", error)
    return NextResponse.json({ error: "Failed to create dependency" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; stepId: string }> }
) {
  const params = await props.params;
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!isUuid(params.id)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    if (!isUuid(params.stepId)) return NextResponse.json({ error: "Step not found", code: "NOT_FOUND" }, { status: 404 })
    if (!(await verifyProjectWriteAccess(params.id, authContext.userId))) {
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
      DELETE FROM step_dependencies
      WHERE step_id = ${params.stepId} AND depends_on_step_id = ${dependsOnId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete dependency:", error)
    return NextResponse.json({ error: "Failed to delete dependency" }, { status: 500 })
  }
}
