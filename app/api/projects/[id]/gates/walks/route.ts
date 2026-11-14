/**
 * Walks: an agent uses the product toward a goal, as a person would, and records what happened.
 *
 * GET  /api/projects/[id]/gates/walks[?build=<sha>]   the walks, which use cases have been walked, and what they left open
 * POST /api/projects/[id]/gates/walks                 { goal, useCase?, persona?, route?, cold, outcome, why?, steps, findings, env?, build?, agent? }
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { WalkError, listWalks, saveWalk } from "@/lib/walks/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    return NextResponse.json(await listWalks(projectId, request.nextUrl.searchParams.get("build")?.slice(0, 80) || undefined))
  } catch (error) {
    console.error("walks load failed", error)
    return NextResponse.json({ error: "Could not load the walks" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    // A signed-in session is the owner walking it themselves; an API key, or an agent using their tab (agent: true), is an agent.
    const actor = auth.authType === "session" && b?.agent !== true ? "owner" : "agent"
    return NextResponse.json({ ok: true, ...(await saveWalk({ projectId, userId: auth.userId, raw: b, actor })) })
  } catch (error) {
    if (error instanceof WalkError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("walk save failed", error)
    return NextResponse.json({ error: "Could not save the walk" }, { status: 500 })
  }
}
