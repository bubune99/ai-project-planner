/**
 * People and flows: who the project is for and what they come to do.
 *
 * GET /api/projects/[id]/people   the document, its version, the record of changes, and the project's scanned pages
 * PUT /api/projects/[id]/people   { doc, baseVersion, agent? }   save the whole document (refused if it changed underneath)
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { listPages } from "@/lib/gates/store"
import { FlowError, loadFlows, saveFlows } from "@/lib/people/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const [flows, pages] = await Promise.all([loadFlows(projectId), listPages(projectId)])
    return NextResponse.json({ ...flows, pages: pages.map((p) => ({ id: p.id, route: p.route, title: p.title })), canEdit: await verifyProjectWriteAccess(projectId, auth.userId) })
  } catch (error) {
    console.error("people and flows load failed", error)
    return NextResponse.json({ error: "Could not load people and flows" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    if (!b || typeof b !== "object" || !Number.isInteger(b.baseVersion)) return NextResponse.json({ error: "Send { doc, baseVersion }" }, { status: 400 })
    // A signed-in session is the owner at the planner. An API key is an agent, and so is an agent that saves through
    // the owner's signed-in browser tab and says so (agent: true). The record keeps which it was.
    const actor = auth.authType === "session" && b.agent !== true ? "owner" : "agent"
    const saved = await saveFlows({ projectId, userId: auth.userId, raw: b.doc, baseVersion: b.baseVersion, actor })
    return NextResponse.json({ ok: true, actor, ...saved })
  } catch (error) {
    if (error instanceof FlowError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("people and flows save failed", error)
    return NextResponse.json({ error: "Could not save people and flows" }, { status: 500 })
  }
}
