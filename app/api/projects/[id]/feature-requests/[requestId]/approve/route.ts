import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  try {
    const { id, requestId } = params

    const [featureRequest] = await sql`
      SELECT * FROM feature_requests WHERE id = ${requestId}
    `

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 })
    }

    const [step] = await sql`
      INSERT INTO project_steps (
        project_id, title, description, status, priority
      ) VALUES (
        ${id}, ${featureRequest.title}, ${featureRequest.description}, 
        'pending', ${featureRequest.priority}
      )
      RETURNING *
    `

    await sql`
      UPDATE feature_requests
      SET status = 'approved', created_step_id = ${step.id}
      WHERE id = ${requestId}
    `

    return NextResponse.json({ step })
  } catch (error) {
    console.error("Error approving feature request:", error)
    return NextResponse.json({ error: "Failed to approve feature request" }, { status: 500 })
  }
}
