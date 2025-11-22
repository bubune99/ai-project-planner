import { NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

/**
 * GET /api/projects/[id]/documents?category=xxx
 * Get all documents for a project with optional category filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    console.log(`[GET /api/projects/${projectId}/documents] Fetching documents`, { category })

    // Fetch all documents for this project
    const documents = category
      ? await sql`
          SELECT
            id,
            title,
            description,
            content,
            doc_type,
            category,
            tags,
            version,
            last_edited_by,
            updated_at,
            created_at
          FROM documents
          WHERE project_id = ${projectId}
            AND category = ${category}
            AND deleted_at IS NULL
          ORDER BY category, created_at ASC
        `
      : await sql`
          SELECT
            id,
            title,
            description,
            content,
            doc_type,
            category,
            tags,
            version,
            last_edited_by,
            updated_at,
            created_at
          FROM documents
          WHERE project_id = ${projectId}
            AND deleted_at IS NULL
          ORDER BY category, created_at ASC
        `

    console.log(`[GET /api/projects/${projectId}/documents] Found ${documents.length} documents`)

    return NextResponse.json({
      documents,
      count: documents.length,
    })
  } catch (error: any) {
    console.error(`[GET /api/projects/${params.id}/documents] Error:`, error)
    return NextResponse.json(
      { error: 'Failed to get documents', details: error.message },
      { status: 500 }
    )
  }
}
