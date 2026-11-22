/**
 * Undo deleting a board column: the column comes back and the tasks its delete moved go back into it
 * (Tasks tab check, 2026-11-15: a deleted column could not be brought back). Write access only.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { isUuid } from "@/lib/api/ids"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; statusId: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, statusId } = await params
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (!isUuid(statusId)) return NextResponse.json({ error: "No deleted column with that id" }, { status: 404 })
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const body = await request.json().catch(() => null)
    const stepIds: string[] = Array.isArray(body?.stepIds) ? body.stepIds.filter((x: unknown) => typeof x === "string").slice(0, 2000) : []
    const [row] = (await sql`
      UPDATE project_statuses SET deleted_at = NULL, updated_at = NOW()
       WHERE id = ${statusId} AND project_id = ${projectId} AND deleted_at IS NOT NULL
      RETURNING key
    `) as { key: string }[]
    if (!row) return NextResponse.json({ error: "No deleted column with that id" }, { status: 404 })
    const moved = stepIds.length
      ? ((await sql`
          UPDATE project_steps SET status = ${row.key}, updated_at = NOW()
           WHERE project_id = ${projectId} AND id = ANY(${stepIds}::uuid[]) AND deleted_at IS NULL
          RETURNING id
        `) as { id: string }[])
      : []
    return NextResponse.json({ success: true, key: row.key, movedBack: moved.length })
  } catch (e) {
    console.error("[statuses/restore]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not bring the column back" }, { status: 500 })
  }
}
