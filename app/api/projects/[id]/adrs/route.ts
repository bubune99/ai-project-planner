import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { buildEnvelopeForWrite, envelopeForSql } from "@/lib/api/envelope-helpers"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const adrs = await sql`
      SELECT * FROM architecture_decisions
      WHERE project_id = ${id}
      ORDER BY created_at DESC
    `

    return NextResponse.json({ adrs })
  } catch (error) {
    console.error("Error fetching ADRs:", error)
    return NextResponse.json({ error: "Failed to fetch ADRs" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { title, context, decision, consequences, alternatives_considered } = body

    // Validate required fields
    if (!title || !context || !decision) {
      return NextResponse.json(
        { error: "Missing required fields: title, context, and decision are required" },
        { status: 400 }
      )
    }

    // Get auth context for envelope (non-fatal: ADR endpoints historically lack auth gate)
    const authContext = await getAuthContext().catch(() => null)
    let envelopeSql: string | null = null
    if (authContext?.userId) {
      const envelopeResult = buildEnvelopeForWrite(
        body,
        { userId: authContext.userId, projectId: id, agentId: undefined },
        {
          type: 'decision',
          title,
          summary: context?.slice(0, 200),
          rationale: decision?.slice(0, 500),
        },
        'legacy'
      )
      if (envelopeResult.ok) {
        envelopeSql = envelopeForSql(envelopeResult.envelope)
      }
    }

    const [adr] = await sql`
      INSERT INTO architecture_decisions (
        project_id, title, context, decision, consequences, alternatives_considered, status, documentation_5wh
      ) VALUES (
        ${id}, ${title}, ${context}, ${decision}, ${consequences || null},
        ${alternatives_considered ? JSON.stringify(alternatives_considered) : null}, 'proposed',
        ${envelopeSql}::jsonb
      )
      RETURNING *
    `

    return NextResponse.json({ adr }, { status: 201 })
  } catch (error) {
    console.error("Error creating ADR:", error)
    return NextResponse.json({ error: "Failed to create ADR" }, { status: 500 })
  }
}
