import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/documents
 * Get all documents for a project (chapters and pages)
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id

    console.log(`[GET /api/projects/${projectId}/documents] Fetching documents`)

    // Fetch all documents for this project, ordered by type then title
    const documents = await sql`
      SELECT
        id,
        title,
        description,
        content,
        doc_type,
        parent_id,
        category,
        last_edited_by,
        updated_at,
        created_at
      FROM documents
      WHERE project_id = ${projectId}
        AND deleted_at IS NULL
      ORDER BY 
        CASE doc_type 
          WHEN 'chapter' THEN 0
          WHEN 'page' THEN 1
          ELSE 2
        END,
        title ASC
    `

    console.log(`[GET /api/projects/${projectId}/documents] Found ${documents.length} documents`)

    return NextResponse.json({
      documents,
      count: documents.length,
    })
  } catch (error: any) {
    console.error(`[GET /api/projects/${params.id}/documents] Error:`, error)
    return NextResponse.json({ error: "Failed to get documents", details: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/documents
 * Create a new document (chapter or page)
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id
    const body = await request.json()
    const { title, description, content, doc_type, parent_id, category } = body

    console.log(`[POST /api/projects/${projectId}/documents] Creating document`, {
      title,
      doc_type,
      parent_id,
    })

    const [document] = await sql`
      INSERT INTO documents (
        project_id,
        title,
        description,
        content,
        doc_type,
        parent_id,
        category
      ) VALUES (
        ${projectId},
        ${title},
        ${description || null},
        ${content || ""},
        ${doc_type || "general"},
        ${parent_id || null},
        ${category || "documentation"}
      )
      RETURNING *
    `

    console.log(`[POST /api/projects/${projectId}/documents] Created document ${document.id}`)

    return NextResponse.json(document, { status: 201 })
  } catch (error: any) {
    console.error(`[POST /api/projects/${params.id}/documents] Error:`, error)
    return NextResponse.json({ error: "Failed to create document", details: error.message }, { status: 500 })
  }
}
