import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const { dependsOnId } = await request.json()

    await sql`
      INSERT INTO project_step_dependencies (step_id, depends_on_id)
      VALUES (${params.stepId}, ${dependsOnId})
      ON CONFLICT (step_id, depends_on_id) DO NOTHING
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to create dependency:", error)
    return NextResponse.json({ error: "Failed to create dependency" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const dependsOnId = searchParams.get("dependsOnId")

    await sql`
      DELETE FROM project_step_dependencies
      WHERE step_id = ${params.stepId} AND depends_on_id = ${dependsOnId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete dependency:", error)
    return NextResponse.json({ error: "Failed to delete dependency" }, { status: 500 })
  }
}
