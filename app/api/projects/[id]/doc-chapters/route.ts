import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id

    // Get all chapters (parent documents) with their pages (child documents)
    const chapters = await sql`
      SELECT 
        d.id,
        d.title,
        d.description,
        COALESCE(d.content, '📁') as icon,
        0 as order_index,
        true as is_expanded,
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'title', p.title,
              'slug', LOWER(REPLACE(p.title, ' ', '-')),
              'icon', COALESCE(p.content, '📄'),
              'order_index', 0,
              'last_edited_by', COALESCE(p.last_edited_by, 'Unknown'),
              'updated_at', p.updated_at,
              'content', p.content
            )
            ORDER BY p.created_at
          )
          FROM documents p
          WHERE p.parent_id = d.id
            AND p.deleted_at IS NULL
        ) as pages
      FROM documents d
      WHERE d.project_id = ${projectId}::uuid
        AND d.parent_id IS NULL
        AND d.deleted_at IS NULL
      ORDER BY d.created_at
    `

    // Transform to match expected format
    const formattedChapters = chapters.map((chapter: any) => ({
      ...chapter,
      pages: chapter.pages || [],
    }))

    return NextResponse.json({ chapters: formattedChapters })
  } catch (error) {
    console.error("[v0] Failed to fetch chapters:", error)
    return NextResponse.json({ error: "Failed to fetch chapters" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id
    const body = await request.json()
    const { title, description, icon = "📁" } = body

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const [chapter] = await sql`
      INSERT INTO documents (
        project_id,
        title,
        description,
        content,
        doc_type,
        s3_key,
        file_type,
        file_size,
        category
      )
      VALUES (
        ${projectId}::uuid,
        ${title},
        ${description || ""},
        ${icon},
        'general',
        'chapter',
        'text/plain',
        0,
        'general'
      )
      RETURNING *
    `

    return NextResponse.json({ chapter }, { status: 201 })
  } catch (error) {
    console.error("[v0] Failed to create chapter:", error)
    return NextResponse.json({ error: "Failed to create chapter" }, { status: 500 })
  }
}
