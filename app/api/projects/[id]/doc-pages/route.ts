import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id
    const body = await request.json()
    const { chapter_id, title, slug, icon, content, order_index, last_edited_by } = body

    const [page] = await sql`
      INSERT INTO doc_pages (
        project_id, 
        chapter_id, 
        title, 
        slug, 
        icon, 
        content, 
        order_index,
        last_edited_by
      )
      VALUES (
        ${projectId}, 
        ${chapter_id}, 
        ${title}, 
        ${slug || title.toLowerCase().replace(/\s+/g, "-")}, 
        ${icon || "📝"}, 
        ${content || ""}, 
        ${order_index || 0},
        ${last_edited_by || "User"}
      )
      RETURNING *
    `

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating doc page:", error)
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 })
  }
}
