import { sql } from "@/lib/db/client"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    const stepId = searchParams.get("stepId")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 })
    }

    let notes
    if (stepId) {
      notes = await sql`
        SELECT * FROM progress_notes
        WHERE project_id = ${projectId} AND step_id = ${stepId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    } else {
      notes = await sql`
        SELECT * FROM progress_notes
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    }

    return NextResponse.json({ notes })
  } catch (error: any) {
    console.error("Get progress notes error:", error)
    return NextResponse.json({ error: "Failed to get progress notes", details: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, stepId, author_type, author_name, note_type, title, content, metadata } = body

    if (!projectId || !author_type || !author_name || !note_type || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO progress_notes (
        project_id,
        step_id,
        author_type,
        author_name,
        note_type,
        title,
        content,
        metadata
      ) VALUES (
        ${projectId},
        ${stepId || null},
        ${author_type},
        ${author_name},
        ${note_type},
        ${title || null},
        ${content},
        ${metadata ? JSON.stringify(metadata) : '{}'}::jsonb
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, note: result[0] })
  } catch (error: any) {
    console.error("Create progress note error:", error)
    return NextResponse.json({ error: "Failed to create progress note", details: error.message }, { status: 500 })
  }
}
