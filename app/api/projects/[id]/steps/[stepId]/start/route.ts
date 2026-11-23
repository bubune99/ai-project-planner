/**
 * Start a card: put it in Up next (the ready line) and send it to the project's agents.
 * Owner, 2026-11-16 (inbox be28f3e9): "it gets put on the ready for when an agent becomes available ... If an agent is
 * connected it gets added to the queue to really run through." The card moves to In Progress only when an agent takes
 * it. Rules in lib/work/pipeline.ts (startMove), checked in pipeline.assert.ts.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { startMove, type WorkRow } from "@/lib/work/pipeline"
import { sendNow } from "@/lib/work/send"
import { isUuid } from "@/lib/api/ids"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, stepId } = await params
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (!isUuid(stepId)) return NextResponse.json({ error: "Card not found" }, { status: 404 })
    if (!(await verifyProjectWriteAccess(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    const [step] = (await sql`
      SELECT id, title, status, priority, parent_task_id, order_index, description, work_kind, claimed_by_id, claimed_at, metadata
        FROM project_steps WHERE id = ${stepId} AND project_id = ${projectId} AND deleted_at IS NULL
    `) as WorkRow[]
    if (!step) return NextResponse.json({ error: "Card not found" }, { status: 404 })
    const move = startMove(step)
    if (!move.send) return NextResponse.json({ error: move.why || "This card cannot be started" }, { status: 409 })
    if (move.to) {
      await sql`UPDATE project_steps SET status = ${move.to}, updated_at = NOW() WHERE id = ${stepId}`
      step.status = move.to
    }
    const sent = await sendNow(step, projectId, auth.userId)
    const [project] = (await sql`SELECT name FROM projects WHERE id = ${projectId}`) as { name: string }[]
    // "Health & Habits's" read wrong: a name ending in s takes the apostrophe alone.
    const name = project?.name ?? "the project"
    const whose = /s$/i.test(name) ? `${name}'` : `${name}'s`
    return NextResponse.json({
      column: "pending",
      jobId: sent.jobId,
      already: sent.already,
      message: sent.already
        ? `Already in line for ${whose} agents.`
        : `In line for ${whose} agents. It moves to In Progress when one takes it.`,
    })
  } catch (error: unknown) {
    console.error("[start] failed", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Could not start this card" }, { status: 500 })
  }
}
