/**
 * Checks: one page's checklist.
 *
 * GET  /api/projects/[id]/gates/[checklistId]  the list, its verdicts, pictures and progress
 * POST /api/projects/[id]/gates/[checklistId]
 *        { action: "check", keys, status: "passed" | "failed", note?, actor?: "builder" | "reviewer" }
 *        { action: "verdict", keys, status: "passed" | "failed" | "waived", note?, said? }   the owner settles or waives:
 *                                                 signed in, or relayed by an agent with their words (said)
 *        { action: "image", kind: "view" | "evidence", refKey, imageBase64 }
 *        { action: "extract", refKey: <view key>, gzBase64 }   the view's styled HTML, gzipped
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnerOnly, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { GateError, attachExtract, attachImage, getChecklist, loadPage, recordResults } from "@/lib/gates/store"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string; checklistId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function find(projectId: string, checklistId: string) {
  if (!UUID.test(checklistId)) return null
  const row = await getChecklist(checklistId)
  return row && row.project_id === projectId ? row : null
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, checklistId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const row = await find(projectId, checklistId)
    if (!row) return NextResponse.json({ error: "Checklist not found" }, { status: 404 })
    return NextResponse.json({ ...(await loadPage(row)), canSettle: await verifyProjectOwnerOnly(projectId, auth.userId) })
  } catch (error) {
    console.error("gate load failed", error)
    return NextResponse.json({ error: "Could not load the checklist" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, checklistId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const checklist = await find(projectId, checklistId)
    if (!checklist) return NextResponse.json({ error: "Checklist not found" }, { status: 404 })
    const body = await request.json().catch(() => null)
    const keys: string[] = Array.isArray(body?.keys) ? body.keys.filter((k: unknown) => typeof k === "string").slice(0, 500) : []
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined
    if (body?.action === "verdict") {
      if (!(await verifyProjectOwnerOnly(projectId, auth.userId))) return NextResponse.json({ error: "Only the project owner can settle or waive a check" }, { status: 403 })
      if (!["passed", "failed", "waived"].includes(body.status)) return NextResponse.json({ error: "status must be passed, failed or waived" }, { status: 400 })
      // Signed in: the owner themselves. With an API key: an agent relaying what the owner answered in Claude Code.
      // The owner is not always in the planner, so that is allowed; it is recorded as relayed, with their words.
      const said = typeof body.said === "string" ? body.said.trim().slice(0, 500) : ""
      // An agent saving through the owner's signed-in tab says so (agent: true) and is treated as an agent.
      const asOwner = auth.authType === "session" && body.agent !== true
      if (!asOwner && said.length < 2) return NextResponse.json({ error: "Relay the owner's own reply in said" }, { status: 400 })
      const relayed = asOwner ? note : `Answered by the owner in Claude Code: "${said}"${note ? ` ${note}` : ""}`
      return NextResponse.json(await recordResults({ checklist, userId: auth.userId, keys, actor: "owner", status: body.status, note: relayed }))
    }
    if (body?.action === "check") {
      if (!["passed", "failed"].includes(body.status)) return NextResponse.json({ error: "status must be passed or failed" }, { status: 400 })
      const actor = body.actor === "reviewer" ? "reviewer" : "builder"
      return NextResponse.json(await recordResults({ checklist, userId: auth.userId, keys, actor, status: body.status, note }))
    }
    if (body?.action === "image") {
      if (!["view", "evidence"].includes(body.kind) || typeof body.refKey !== "string" || typeof body.imageBase64 !== "string") {
        return NextResponse.json({ error: "Send { kind, refKey, imageBase64 }" }, { status: 400 })
      }
      return NextResponse.json(await attachImage({ checklist, userId: auth.userId, kind: body.kind, refKey: body.refKey, imageBase64: body.imageBase64 }))
    }
    if (body?.action === "extract") {
      if (typeof body.refKey !== "string" || typeof body.gzBase64 !== "string") return NextResponse.json({ error: "Send { refKey, gzBase64 }" }, { status: 400 })
      return NextResponse.json(await attachExtract({ checklist, userId: auth.userId, viewKey: body.refKey, gzBase64: body.gzBase64 }))
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("gate write failed", error)
    return NextResponse.json({ error: "Could not save that" }, { status: 500 })
  }
}
