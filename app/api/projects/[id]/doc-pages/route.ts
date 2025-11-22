import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id
    const body = await request.json()
    const { title, content = "", icon = "📄", chapter_id } = body

    if (!title || !chapter_id) {
      return NextResponse.json({ error: "Title and chapter_id are required" }, { status: 400 })
    }

    const [page] = await sql`
      INSERT INTO documents (
        project_id,
        parent_id,
        title,
        content,
        doc_type,
        s3_key,
        file_type,
        file_size,
        category
      )
      VALUES (
        ${projectId}::uuid,
        ${chapter_id}::uuid,
        ${title},
        ${content || ""},
        'general',
        'inline',
        'text/markdown',
        ${content?.length || 0},
        'general'
      )
      RETURNING *
    `

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    console.error("[v0] Failed to create page:", error)
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 })
  }
}
