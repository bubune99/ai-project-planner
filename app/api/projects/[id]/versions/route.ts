import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    const versions = await sql`
      SELECT 
        pv.*,
        COUNT(DISTINCT ps.id) as total_steps,
        COUNT(DISTINCT CASE WHEN ps.status = 'completed' THEN ps.id END) as completed_steps,
        CASE 
          WHEN COUNT(DISTINCT ps.id) > 0 
          THEN ROUND((COUNT(DISTINCT CASE WHEN ps.status = 'completed' THEN ps.id END)::numeric / COUNT(DISTINCT ps.id)::numeric) * 100)
          ELSE 0 
        END as progress_percentage
      FROM project_versions pv
      LEFT JOIN project_steps ps ON ps.version_id = pv.id
      WHERE pv.project_id = ${id}
      GROUP BY pv.id
      ORDER BY pv.created_at DESC
    `

    return NextResponse.json({ versions })
  } catch (error) {
    console.error("Error fetching versions:", error)
    return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { version_number, name, description, goals, target_date } = body

    const [version] = await sql`
      INSERT INTO project_versions (
        project_id, version_number, name, description, goals, target_date, status
      ) VALUES (
        ${id}, ${version_number}, ${name}, ${description || null}, 
        ${goals ? JSON.stringify(goals) : null}, ${target_date || null}, 'planning'
      )
      RETURNING *
    `

    return NextResponse.json({ version }, { status: 201 })
  } catch (error) {
    console.error("Error creating version:", error)
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 })
  }
}
