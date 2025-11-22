import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id

    // Get all chapters with their pages
    const chapters = await sql`
      SELECT 
        c.id,
        c.title,
        c.description,
        c.icon,
        c.order_index,
        c.parent_chapter_id,
        c.is_expanded,
        c.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'title', p.title,
              'slug', p.slug,
              'icon', p.icon,
              'order_index', p.order_index,
              'last_edited_by', p.last_edited_by,
              'updated_at', p.updated_at
            ) ORDER BY p.order_index
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as pages
      FROM doc_chapters c
      LEFT JOIN doc_pages p ON p.chapter_id = c.id AND p.deleted_at IS NULL
      WHERE c.project_id = ${projectId} 
        AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.order_index
    `

    return NextResponse.json({ chapters })
  } catch (error) {
    console.error("[v0] Error fetching doc chapters:", error)
    return NextResponse.json({ error: "Failed to fetch chapters" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id
    const body = await request.json()
    const { title, description, icon, parent_chapter_id, order_index } = body

    const [chapter] = await sql`
      INSERT INTO doc_chapters (project_id, title, description, icon, parent_chapter_id, order_index)
      VALUES (${projectId}, ${title}, ${description || null}, ${icon || "📄"}, ${parent_chapter_id || null}, ${order_index || 0})
      RETURNING *
    `

    return NextResponse.json({ chapter }, { status: 201 })
  } catch (error) {
    console.error("[v0] Error creating doc chapter:", error)
    return NextResponse.json({ error: "Failed to create chapter" }, { status: 500 })
  }
}
