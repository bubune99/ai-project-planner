import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { mergeEnvelopeForPatch, envelopeForSql } from "@/lib/api/envelope-helpers"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string; adrId: string } }) {
  try {
    const { id, adrId } = params
    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json(
        { error: "Status is required" },
        { status: 400 }
      )
    }

    // Get auth context for envelope (non-fatal)
    const authContext = await getAuthContext().catch(() => null)
    let envelopeSql: string | null = null
    if (authContext?.userId) {
      const existing = await sql`SELECT documentation_5wh FROM architecture_decisions WHERE id = ${adrId}`
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
      WHERE id = ${adrId}
      RETURNING *
    `

    return NextResponse.json({ adr })
  } catch (error) {
    console.error("Error updating ADR:", error)
    return NextResponse.json({ error: "Failed to update ADR" }, { status: 500 })
  }
}
