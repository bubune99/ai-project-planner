import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function PATCH(request: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  try {
    const { requestId } = params
    const body = await request.json()
    const { status } = body

    const [featureRequest] = await sql`
      UPDATE feature_requests
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${requestId}
      RETURNING *
    `

    return NextResponse.json({ request: featureRequest })
  } catch (error) {
    console.error("Error updating feature request:", error)
    return NextResponse.json({ error: "Failed to update feature request" }, { status: 500 })
  }
}
