import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access"
import { mergeEnvelopeForPatch, envelopeForSql } from "@/lib/api/envelope-helpers"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string; adrId: string } }) {
  try {
    const { id, adrId } = params

    const authContext = await getAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
    }
    if (!(await verifyProjectOwnership(id, authContext.userId))) {
      return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (!(await verifyCollaboratorAccess(id, authContext.userId, "editor"))) {
      return NextResponse.json({ error: "Forbidden", code: "INSUFFICIENT_PERMISSIONS" }, { status: 403 })
    }

    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json(
        { error: "Status is required" },
        { status: 400 }
      )
    }

    let envelopeSql: string | null = null
    if (authContext?.userId) {
      const existing = await sql`SELECT documentation_5wh FROM architecture_decisions WHERE id = ${adrId} AND project_id = ${id}`
      const mergeResult = mergeEnvelopeForPatch(
        existing[0]?.documentation_5wh,
        body,
        { userId: authContext.userId, projectId: id, agentId: undefined },
        {
          type: 'decision',
          title: body.title || undefined,
          summary: body.context || body.summary,
          rationale: body?.documentation_5wh?.why?.rationale || `Status updated to: ${status}`,
        }
      )
      if (mergeResult.ok) {
        envelopeSql = envelopeForSql(mergeResult.envelope)
      }
    }

    const [adr] = await sql`
      UPDATE architecture_decisions
      SET
        status            = ${status},
        documentation_5wh = COALESCE(${envelopeSql}::jsonb, documentation_5wh),
        updated_at        = NOW()
      WHERE id = ${adrId} AND project_id = ${id}
      RETURNING *
    `

    if (!adr) {
      return NextResponse.json({ error: "ADR not found" }, { status: 404 })
    }

    return NextResponse.json({ adr })
  } catch (error) {
    console.error("Error updating ADR:", error)
    return NextResponse.json({ error: "Failed to update ADR" }, { status: 500 })
  }
}
