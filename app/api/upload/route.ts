import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import crypto from 'crypto'

/**
 * POST /api/upload
 * Upload file to Vercel Blob and create document record
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const projectId = formData.get('projectId') as string
    const category = formData.get('category') as string || 'other'
    const title = formData.get('title') as string
    const description = formData.get('description') as string

    // Validation
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
      'image/gif',
      // Documents
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'text/plain',
      'application/json',
      // Design files
      'application/x-sketch',
      'application/vnd.figma',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Allowed types: images, PDFs, spreadsheets, documents.`,
        },
        { status: 400 }
      )
    }

    // Calculate content hash for deduplication
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Check for existing file with same hash in this project
    const existingDocs = await sql`
      SELECT id, blob_url, title, blob_key FROM documents
      WHERE project_id = ${projectId}
        AND content_hash = ${hash}
        AND deleted_at IS NULL
    `

    if (existingDocs.rows.length > 0) {
      const existing = existingDocs.rows[0]
      return NextResponse.json({
        message: 'File already exists in this project',
        documentId: existing.id,
        blobUrl: existing.blob_url,
        duplicate: true,
        existingTitle: existing.title,
      })
    }

    // Upload to Vercel Blob
    const pathname = `projects/${projectId}/${Date.now()}-${file.name}`
    const blob = await put(pathname, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
    })

    // Generate thumbnail for images (placeholder - would use Sharp or Vercel Image Optimization)
    let thumbnailUrl = null
    const metadata: any = {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    }

    if (file.type.startsWith('image/')) {
      // For now, use the original image as thumbnail
      // TODO: Implement actual thumbnail generation with Sharp
      thumbnailUrl = blob.url
      metadata.isImage = true
    }

    // Create document record
    const documentResult = await sql`
      INSERT INTO documents (
        project_id,
        title,
        description,
        blob_key,
        blob_url,
        thumbnail_url,
        file_type,
        file_size,
        category,
        content_hash,
        uploaded_by,
        metadata
      ) VALUES (
        ${projectId},
        ${title || file.name},
        ${description || null},
        ${blob.pathname},
        ${blob.url},
        ${thumbnailUrl},
        ${file.type},
        ${file.size},
        ${category},
        ${hash},
        ${request.headers.get('x-user-id') || 'anonymous'},
        ${JSON.stringify(metadata)}
      )
      RETURNING *
    `

    const document = documentResult.rows[0]

    // Log to execution history
    await sql`
      INSERT INTO execution_history (
        project_id,
        event_type,
        description,
        new_value
      ) VALUES (
        ${projectId},
        'document_uploaded',
        ${`Document uploaded: ${document.title}`},
        ${JSON.stringify({
          documentId: document.id,
          fileName: file.name,
          fileSize: file.size,
          category,
        })}
      )
    `

    return NextResponse.json({
      success: true,
      document,
      blobUrl: blob.url,
      downloadUrl: blob.downloadUrl,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/upload?filename=xxx&projectId=yyy
 * Get presigned upload URL (for large files via client-side upload)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filename = searchParams.get('filename')
  const projectId = searchParams.get('projectId')

  if (!filename || !projectId) {
    return NextResponse.json(
      { error: 'Missing filename or projectId parameter' },
      { status: 400 }
    )
  }

  // For Vercel Blob, we don't need presigned URLs for client-side upload
  // Just return the pathname pattern
  const pathname = `projects/${projectId}/${Date.now()}-${filename}`

  return NextResponse.json({
    uploadUrl: '/api/upload',
    pathname,
    maxSize: 50 * 1024 * 1024, // 50MB
  })
}
