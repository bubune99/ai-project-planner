/**
 * Checks: the plan for a page (what it is supposed to have).
 *
 * GET  /api/projects/[id]/gates/plan?route=/x   the plan, how the latest scan compares, and the change record
 * POST /api/projects/[id]/gates/plan
 *        { action: "propose", route, change: "add" | "remove", label, must?, kind?, view?, reason, basis, quote?, replacedBy? }
 *        { action: "answer", route, item, question, text, basis?, quote?, said? }   answer one question about a planned item
 *        { action: "seed", route, checklistId, source: "mockup" | "flow" | "agent", reason }
 *        { action: "decide", route, changeId, approve, said? }   the owner answers a waiting change: signed in, or relayed
 *                                                            by an agent with their words (not for access, money or data)
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnerOnly, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { GateError, getChecklist, listPages } from "@/lib/gates/store"
import { answerIntake, decidePlanChange, loadPlan, proposePlanChange, seedPlan } from "@/lib/gates/plan-store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }
const BASES = ["owner_asked", "rule", "evidence", "judgment"]

async function latestList(projectId: string, route: string) {
  const page = (await listPages(projectId)).find((p) => p.route === route)
  return page ? (await getChecklist(page.id))?.doc ?? null : null
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const route = request.nextUrl.searchParams.get("route") ?? ""
    if (!route.startsWith("/")) return NextResponse.json({ error: "Pass ?route=/page" }, { status: 400 })
    return NextResponse.json({ ...(await loadPlan(projectId, route, await latestList(projectId, route))), canSettle: await verifyProjectOwnerOnly(projectId, auth.userId) })
  } catch (error) {
    console.error("gate plan load failed", error)
    return NextResponse.json({ error: "Could not load the plan" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const b = await request.json().catch(() => null)
    const text = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined)
    // Who is speaking. A signed-in session is the owner at the planner. An API key is an agent. An agent that saves
    // through the owner's signed-in browser tab says so (agent: true), and is treated as an agent, never as the owner.
    const asOwner = auth.authType === "session" && b?.agent !== true
    const route = text(b?.route)
    if (!route || !route.startsWith("/")) return NextResponse.json({ error: "Send the page's route" }, { status: 400 })
    if (b.action === "decide") {
      if (!(await verifyProjectOwnerOnly(projectId, auth.userId))) return NextResponse.json({ error: "Only the project owner can answer this" }, { status: 403 })
      if (typeof b.changeId !== "string" || typeof b.approve !== "boolean") return NextResponse.json({ error: "Send { changeId, approve }" }, { status: 400 })
      // Signed in to the planner: the owner themselves. With an API key: an agent relaying what the owner said in Claude Code.
      if (asOwner) await decidePlanChange(projectId, route, b.changeId, b.approve)
      else await decidePlanChange(projectId, route, b.changeId, b.approve, "claude-code", text(b.said))
      return NextResponse.json({ ok: true })
    }
    if (b.action === "answer") {
      if (!text(b.item) || !text(b.question, 40) || !text(b.text, 1000)) return NextResponse.json({ error: "Send { item, question, text }" }, { status: 400 })
      // Signed in: the owner's own answer. With an API key: an agent's answer with what it rests on, or the owner's
      // reply relayed from Claude Code (said), which is recorded as theirs with their words.
      const relayed = !asOwner && text(b.said, 600)
      const by = asOwner || relayed ? "owner" : "agent"
      const basis = by === "owner" ? "owner_asked" : BASES.includes(b.basis) ? b.basis : "judgment"
      return NextResponse.json(await answerIntake({ projectId, route, item: text(b.item)!, question: text(b.question, 40)!, text: text(b.text, 1000)!, by, basis, quote: relayed || text(b.quote, 600) }))
    }
    if (b.action === "seed") {
      const from = typeof b.checklistId === "string" ? await getChecklist(b.checklistId).catch(() => null) : null
      if (!from || from.project_id !== projectId) return NextResponse.json({ error: "Checklist not found" }, { status: 404 })
      if (!["mockup", "flow", "agent"].includes(b.source)) return NextResponse.json({ error: "source must be mockup, flow or agent" }, { status: 400 })
      return NextResponse.json(await seedPlan({ projectId, userId: auth.userId, route, from: from.doc, source: b.source, reason: text(b.reason, 1000) ?? "" }))
    }
    if (b.action === "propose") {
      if (!["add", "remove"].includes(b.change) || !BASES.includes(b.basis) || !text(b.label)) return NextResponse.json({ error: "Send { change, label, reason, basis }" }, { status: 400 })
      return NextResponse.json(await proposePlanChange({
        projectId, userId: auth.userId, route, action: b.change, label: text(b.label)!, must: text(b.must), kind: text(b.kind, 40), view: text(b.view, 60),
        reason: text(b.reason, 1000) ?? "", basis: b.basis, quote: text(b.quote, 600), replacedBy: text(b.replacedBy),
      }))
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("gate plan write failed", error)
    return NextResponse.json({ error: "Could not save that" }, { status: 500 })
  }
}
