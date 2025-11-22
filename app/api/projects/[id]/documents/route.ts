import { sql } from '@vercel/postgres'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/projects/[id]/documents?category=xxx
 * Get all documents for a project with optional category filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const result = await sql`
      SELECT * FROM get_project_documents(
        ${params.id}::UUID,
        ${category || null}
      )
    `

    const documents = result.rows

    // Get statistics
    const statsResult = await sql`
      SELECT * FROM document_statistics
      WHERE project_id = ${params.id}
    `

    const statistics = statsResult.rows[0] || {
      total_documents: 0,
      total_size_bytes: 0,
      prd_count: 0,
      design_count: 0,
      spec_count: 0,
      diagram_count: 0,
      export_count: 0,
      image_count: 0,
      pdf_count: 0,
    }

    return NextResponse.json({
      documents,
      statistics,
      count: documents.length,
    })
  } catch (error: any) {
    console.error('Get project documents error:', error)
    return NextResponse.json(
      { error: 'Failed to get documents', details: error.message },
      { status: 500 }
    )
  }
}
