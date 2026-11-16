/**
 * Undo deleting a task (Tasks tab check, 2026-11-15: a deleted task was gone for good from the page, although the
 * delete only marks the row). Brings back a task deleted within the last day. Write access only.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, stepId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const rows = (await sql`
      UPDATE project_steps SET deleted_at = NULL, updated_at = NOW()
       WHERE id = ${stepId} AND project_id = ${projectId}
         AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '1 day'
      RETURNING id, title
    `) as { id: string; title: string }[]
    if (!rows.length) return NextResponse.json({ error: "No recently deleted task with that id" }, { status: 404 })
    return NextResponse.json({ success: true, id: rows[0].id, title: rows[0].title })
  } catch (e) {
    console.error("[steps/restore]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not bring the task back" }, { status: 500 })
  }
}
