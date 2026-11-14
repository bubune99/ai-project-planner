/**
 * Checks: a project's page checklists.
 *
 * GET  /api/projects/[id]/gates  list every page that has a checklist, with where it stands
 * POST /api/projects/[id]/gates  save a page's checklist { route, title?, views, env?, build? }
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { GateError, listPages, saveChecklist } from "@/lib/gates/store"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    return NextResponse.json({ pages: await listPages(projectId) })
  } catch (error) {
    console.error("gates list failed", error)
    return NextResponse.json({ error: "Could not load the checklists" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body.route !== "string" || !Array.isArray(body.views)) return NextResponse.json({ error: "Send { route, views }" }, { status: 400 })
    const saved = await saveChecklist({
      projectId, userId: auth.userId, env: body.env, build: body.build,
      // A targeted scan says which part of the page it covered; the rest of the checklist is left as it is.
      region: body.region && ["x", "y", "w", "h"].every((k) => typeof body.region[k] === "number") ? { x: body.region.x, y: body.region.y, w: body.region.w, h: body.region.h } : undefined,
      list: { route: body.route, ...(body.title ? { title: String(body.title) } : {}), views: body.views },
    })
    return NextResponse.json(saved)
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("gates save failed", error)
    return NextResponse.json({ error: "Could not save the checklist" }, { status: 500 })
  }
}
