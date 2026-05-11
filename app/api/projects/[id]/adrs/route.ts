import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"

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

    const [adr] = await sql`
      INSERT INTO architecture_decisions (
        project_id, title, context, decision, consequences, alternatives_considered, status
      ) VALUES (
        ${id}, ${title}, ${context}, ${decision}, ${consequences || null},
        ${alternatives_considered ? JSON.stringify(alternatives_considered) : null}, 'proposed'
      )
      RETURNING *
    `

    return NextResponse.json({ adr }, { status: 201 })
  } catch (error) {
    console.error("Error creating ADR:", error)
    return NextResponse.json({ error: "Failed to create ADR" }, { status: 500 })
  }
}
