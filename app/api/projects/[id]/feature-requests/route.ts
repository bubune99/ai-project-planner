import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    let requests
    if (status && status !== "all") {
      requests = await sql`
        SELECT * FROM feature_requests
        WHERE project_id = ${id} AND status = ${status}
        ORDER BY 
          CASE priority 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
          END,
          created_at DESC
      `
    } else {
      requests = await sql`
        SELECT * FROM feature_requests
        WHERE project_id = ${id}
        ORDER BY 
          CASE priority 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
          END,
          created_at DESC
      `
    }

    return NextResponse.json({ requests })
  } catch (error) {
    console.error("Error fetching feature requests:", error)
    return NextResponse.json({ error: "Failed to fetch feature requests" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { title, description, type, priority, impact_analysis, effort_estimate, requested_by } = body

    const [featureRequest] = await sql`
      INSERT INTO feature_requests (
        project_id, title, description, type, priority, 
        impact_analysis, effort_estimate, requested_by, status
      ) VALUES (
        ${id}, ${title}, ${description}, ${type}, ${priority},
        ${impact_analysis || null}, ${effort_estimate || null}, 
        ${requested_by}, 'proposed'
      )
      RETURNING *
    `

    return NextResponse.json({ request: featureRequest }, { status: 201 })
  } catch (error) {
    console.error("Error creating feature request:", error)
    return NextResponse.json({ error: "Failed to create feature request" }, { status: 500 })
  }
}
