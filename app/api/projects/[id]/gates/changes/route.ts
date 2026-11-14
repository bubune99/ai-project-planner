/**
 * Changes, shown before and after, with the owner's judgment.
 *
 * GET  /api/projects/[id]/gates/changes[?pictures=0]   the changes with their pictures, and what the owner's judgments add up to
 * POST /api/projects/[id]/gates/changes
 *        { action: "create", title, why, stage: "mock" | "staging" | "production", route?, checkKey?, build?, beforeBase64, afterBase64, agent? }
 *        { action: "judge", id, verdict: "good" | "bad", note? }   the owner only, signed in
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnerOnly, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { createChange, judgeChange, listChanges } from "@/lib/gates/change-store"
import { GateError } from "@/lib/gates/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const out = await listChanges(projectId, request.nextUrl.searchParams.get("pictures") !== "0")
    return NextResponse.json({ ...out, canJudge: auth.authType === "session" && (await verifyProjectOwnerOnly(projectId, auth.userId)) })
  } catch (error) {
    console.error("changes load failed", error)
    return NextResponse.json({ error: "Could not load the changes" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    const asOwner = auth.authType === "session" && b?.agent !== true
    if (b?.action === "judge") {
      // A judgment is the owner's own: signed in at the planner, never an agent, and never an agent using their tab.
      if (!asOwner || !(await verifyProjectOwnerOnly(projectId, auth.userId))) return NextResponse.json({ error: "Only the project owner, signed in, can judge a change" }, { status: 403 })
      if (typeof b.id !== "string") return NextResponse.json({ error: "Send { id, verdict, note }" }, { status: 400 })
      return NextResponse.json(await judgeChange(projectId, b.id, b))
    }
    if (b?.action === "create") return NextResponse.json({ ok: true, ...(await createChange({ projectId, userId: auth.userId, actor: asOwner ? "owner" : "agent", raw: b })) })
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("changes write failed", error)
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }
}
