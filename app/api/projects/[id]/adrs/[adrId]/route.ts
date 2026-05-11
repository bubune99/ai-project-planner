import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string; adrId: string } }) {
  try {
    const { adrId } = params
    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json(
        { error: "Status is required" },
        { status: 400 }
      )
    }

    const [adr] = await sql`
      UPDATE architecture_decisions
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${adrId}
      RETURNING *
    `

    return NextResponse.json({ adr })
  } catch (error) {
    console.error("Error updating ADR:", error)
    return NextResponse.json({ error: "Failed to update ADR" }, { status: 500 })
  }
}
