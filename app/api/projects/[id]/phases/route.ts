import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const phases = await sql`
      SELECT * FROM project_phases
      WHERE project_id = ${id}
      ORDER BY entry_date ASC
    `

    return NextResponse.json({ phases })
  } catch (error) {
    console.error("Error fetching phases:", error)
    return NextResponse.json({ error: "Failed to fetch phases" }, { status: 500 })
  }
}
