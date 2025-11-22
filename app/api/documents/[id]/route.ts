import { del } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/documents/[id]
 * Get document details with version history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await sql`
      SELECT * FROM get_document_with_versions(${params.id}::UUID)
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = result.rows[0]

    return NextResponse.json({ document })
  } catch (error: any) {
    console.error('Get document error:', error)
    return NextResponse.json(
      { error: 'Failed to get document', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/documents/[id]
 * Delete document from blob storage and database (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get document details
    const docResult = await sql`
      SELECT
        d.id,
        d.project_id,
        d.blob_url,
        d.title
      FROM documents d
      WHERE d.id = ${params.id}
        AND d.deleted_at IS NULL
    `

    if (docResult.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = docResult.rows[0]

    // Delete from Vercel Blob
    try {
      await del(document.blob_url)
    } catch (blobError) {
      console.error('Blob deletion error:', blobError)
      // Continue with database deletion even if blob deletion fails
    }

    // Soft delete in database
    await sql`
      UPDATE documents
      SET deleted_at = NOW()
      WHERE id = ${params.id}
    `

    // Log to execution history
    await sql`
      INSERT INTO execution_history (
        project_id,
        event_type,
        description,
        old_value
      ) VALUES (
        ${document.project_id},
        'document_deleted',
        ${`Document deleted: ${document.title}`},
        ${JSON.stringify({ documentId: document.id, title: document.title })}
      )
    `

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
    })
  } catch (error: any) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: 'Delete failed', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/documents/[id]
 * Update document metadata (title, description, category)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { title, description, category } = body

    const result = await sql`
      UPDATE documents
      SET
        title = COALESCE(${title || null}, title),
        description = COALESCE(${description || null}, description),
        category = COALESCE(${category || null}, category)
      WHERE id = ${params.id}
        AND deleted_at IS NULL
      RETURNING *
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = result.rows[0]

    return NextResponse.json({
      success: true,
      document,
    })
  } catch (error: any) {
    console.error('Update error:', error)
    return NextResponse.json(
      { error: 'Update failed', details: error.message },
      { status: 500 }
    )
  }
}
