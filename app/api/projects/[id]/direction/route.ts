/**
 * Direction: which decisions an agent takes alone and which wait for the owner, and the build decisions proposed.
 *
 * GET /api/projects/[id]/direction   the document, its version, the record of changes, and whether the caller may edit
 * PUT /api/projects/[id]/direction   { doc, baseVersion, agent? }   save the whole document (refused if it changed underneath)
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { ownError } from "@/lib/api/error-text"
import { DirectionError, loadDirection, saveDirection } from "@/lib/direction/store"
import { isUuid } from "@/lib/api/ids"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    return NextResponse.json({ ...(await loadDirection(projectId)), canEdit: await verifyProjectWriteAccess(projectId, auth.userId) })
  } catch (error) {
    console.error("direction load failed", error)
    return NextResponse.json({ error: "Could not load the direction" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    if (!b || typeof b !== "object" || !Number.isInteger(b.baseVersion)) return NextResponse.json({ error: "Send { doc, baseVersion }" }, { status: 400 })
    // A signed-in session is the owner; an API key, or an agent saving through his tab with agent: true, is an agent.
    const actor = auth.authType === "session" && b.agent !== true ? "owner" : "agent"
    const saved = await saveDirection({ projectId, userId: auth.userId, raw: b.doc, baseVersion: b.baseVersion, actor })
    return NextResponse.json({ ok: true, actor, ...saved })
  } catch (error) {
    // A DirectionError is this app's own sentence for the person; anything else is logged and answered plainly.
    const ours = ownError(error, DirectionError)
    if (ours) return NextResponse.json({ error: ours.message }, { status: ours.status })
    console.error("direction save failed", error)
    return NextResponse.json({ error: "Could not save the direction" }, { status: 500 })
  }
}
