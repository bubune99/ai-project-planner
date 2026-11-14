/**
 * GET /api/projects/[id]/gates/[checklistId]/extract?view=<key>
 * A view's stored extract as HTML text, for the Checks tab to draw in a sealed frame.
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { getChecklist, readExtract } from "@/lib/gates/store"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; checklistId: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, checklistId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const row = UUID.test(checklistId) ? await getChecklist(checklistId) : null
    if (!row || row.project_id !== projectId) return NextResponse.json({ error: "Checklist not found" }, { status: 404 })
    const html = await readExtract(row.id, request.nextUrl.searchParams.get("view") ?? "")
    if (html === null) return NextResponse.json({ error: "No extract stored for this view" }, { status: 404 })
    return NextResponse.json({ html })
  } catch (error) {
    console.error("gate extract failed", error)
    return NextResponse.json({ error: "Could not load the extract" }, { status: 500 })
  }
}
