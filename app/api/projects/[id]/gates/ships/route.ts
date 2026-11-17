/**
 * Ships: what went live and which pages it touched, so a stored picture can say whether it is still what is live.
 *
 * GET  /api/projects/[id]/gates/ships   each scanned page with where its picture stands, and the project's one line
 * POST /api/projects/[id]/gates/ships   { sha, env: "production" | "staging", files?: string[], routes?: string[], everywhere?, note?, at? }
 *                                       reach: "imports" means routes came from following imports (far-gates),
 *                                       so code files are not counted as "every page" again
 *                                       reported by the agent that shipped, after it has seen the change live
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { ShipError } from "@/lib/gates/fresh-model"
import { projectFreshness, recordShip } from "@/lib/gates/ship-store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    return NextResponse.json(await projectFreshness(projectId))
  } catch (error) {
    console.error("ships load failed", error)
    return NextResponse.json({ error: "Could not load what shipped" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    return NextResponse.json({ ok: true, ship: await recordShip({ projectId, userId: auth.userId, raw: b }), ...(await projectFreshness(projectId)) })
  } catch (error) {
    if (error instanceof ShipError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("ship save failed", error)
    return NextResponse.json({ error: "Could not record what shipped" }, { status: 500 })
  }
}
