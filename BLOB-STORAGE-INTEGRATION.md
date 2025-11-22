# Blob Storage Integration Requirements

## Overview

The AI Project Planner needs blob storage for:
1. **User-uploaded documents** (PRDs, specs, designs, diagrams)
2. **Design assets** (wireframes, mockups, screenshots)
3. **AI-generated content** (architecture diagrams, documentation)
4. **Project exports** (PDF reports, CSV data)
5. **User avatars and profile images**

## Recommended Solution: Vercel Blob

### Why Vercel Blob?

1. **Seamless Integration** - Built for Next.js/Vercel deployments
2. **Simple API** - Easy to use with minimal setup
3. **CDN Distribution** - Fast global delivery
4. **Generous Free Tier** - 10GB storage, 100GB bandwidth
5. **Automatic Optimization** - Image resizing, format conversion
6. **Secure by Default** - Signed URLs, access control

### Alternative: AWS S3
- More control and flexibility
- Slightly more complex setup
- Better for very large files or enterprise needs

**Recommendation:** Start with Vercel Blob, migrate to S3 if needed later.

---

## Database Schema Updates

### Current `documents` Table
Already exists in migration 004, but needs S3 key field clarification:

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  s3_key TEXT NOT NULL,           -- This will be blob URL or S3 key
  file_type TEXT NOT NULL,        -- MIME type
  file_size INTEGER NOT NULL,     -- Bytes
  category TEXT NOT NULL,         -- 'prd', 'design', 'spec', 'diagram', 'export', 'other'
  uploaded_by TEXT,               -- User ID or 'agent:claude'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

### Add New Fields (Migration 016)

```sql
-- Add blob storage metadata
ALTER TABLE documents
  ADD COLUMN blob_url TEXT,              -- Full Vercel Blob URL
  ADD COLUMN thumbnail_url TEXT,         -- For images/PDFs
  ADD COLUMN public_url TEXT,            -- Public shareable link (optional)
  ADD COLUMN content_hash TEXT,          -- For deduplication
  ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb; -- dimensions, page count, etc.

-- Rename s3_key to blob_key for clarity
ALTER TABLE documents RENAME COLUMN s3_key TO blob_key;

-- Add index for quick lookups
CREATE INDEX idx_documents_blob_key ON documents(blob_key);
CREATE INDEX idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL;
```

### New Table: `document_versions` (Optional)

For version control of documents:

```sql
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  blob_key TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version_number)
);

CREATE INDEX idx_document_versions_document ON document_versions(document_id, version_number DESC);
```

---

## Implementation Guide

### 1. Install Vercel Blob

```bash
pnpm add @vercel/blob
```

### 2. Environment Variables

```bash
# .env.local
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx
```

Get token from: https://vercel.com/dashboard/stores

### 3. Upload API Route

**`app/api/upload/route.ts`**

```typescript
import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const projectId = formData.get('projectId') as string
    const category = formData.get('category') as string
    const title = formData.get('title') as string
    const description = formData.get('description') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/json'
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    // Calculate content hash for deduplication
    const arrayBuffer = await file.arrayBuffer()
    const hash = crypto.createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex')

    // Check for existing file with same hash
    const [existing] = await sql`
      SELECT id, blob_url, title FROM documents
      WHERE project_id = ${projectId}
        AND content_hash = ${hash}
        AND deleted_at IS NULL
    `

    if (existing) {
      return NextResponse.json({
        message: 'File already exists',
        documentId: existing.id,
        blobUrl: existing.blob_url,
        duplicate: true
      })
    }

    // Upload to Vercel Blob
    const blob = await put(`projects/${projectId}/${Date.now()}-${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
    })

    // Generate thumbnail for images
    let thumbnailUrl = null
    if (file.type.startsWith('image/')) {
      // TODO: Implement thumbnail generation
      // Can use Vercel's image optimization or Sharp
    }

    // Create document record
    const [document] = await sql`
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
        ${request.headers.get('user-id') || 'anonymous'},
        ${JSON.stringify({
          originalName: file.name,
          uploadedAt: new Date().toISOString()
        })}
      )
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      document,
      blobUrl: blob.url,
      downloadUrl: blob.downloadUrl
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// Get presigned upload URL (for large files)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filename = searchParams.get('filename')
  const projectId = searchParams.get('projectId')

  if (!filename || !projectId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // Return presigned URL for client-side upload
  // This is useful for very large files
  const pathname = `projects/${projectId}/${Date.now()}-${filename}`

  return NextResponse.json({
    uploadUrl: `/api/upload`,
    pathname
  })
}
```

### 4. Download/Delete API Routes

**`app/api/documents/[id]/route.ts`**

```typescript
import { del } from '@vercel/blob'
import { sql } from '@vercel/postgres'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const [document] = await sql`
    SELECT * FROM documents
    WHERE id = ${params.id}
      AND deleted_at IS NULL
  `

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  return NextResponse.json({ document })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get document details
    const [document] = await sql`
      SELECT blob_url FROM documents
      WHERE id = ${params.id}
        AND deleted_at IS NULL
    `

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete from Vercel Blob
    await del(document.blob_url)

    // Soft delete in database
    await sql`
      UPDATE documents
      SET deleted_at = NOW()
      WHERE id = ${params.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
```

### 5. MCP Tools for Documents

Add to `app/mcp/[transport]/route.ts`:

```typescript
case 'upload_document': {
  const { projectId, title, description, category, fileData, fileName, fileType } = args

  // Decode base64 file data
  const buffer = Buffer.from(fileData, 'base64')

  // Upload to Vercel Blob
  const blob = await put(`projects/${projectId}/${Date.now()}-${fileName}`, buffer, {
    access: 'public',
    contentType: fileType,
  })

  // Calculate hash
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  // Create document record
  const [document] = await sql`
    INSERT INTO documents (
      project_id, title, description,
      blob_key, blob_url, file_type, file_size,
      category, content_hash, uploaded_by
    ) VALUES (
      ${projectId}, ${title}, ${description || null},
      ${blob.pathname}, ${blob.url}, ${fileType}, ${buffer.length},
      ${category}, ${hash}, 'agent'
    )
    RETURNING *
  `

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        document,
        blobUrl: blob.url
      })
    }]
  }
}

case 'download_document': {
  const { documentId } = args

  const [document] = await sql`
    SELECT * FROM documents WHERE id = ${documentId} AND deleted_at IS NULL
  `

  if (!document) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'Document not found' })
      }]
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        document,
        downloadUrl: document.blob_url
      })
    }]
  }
}
```

---

## UI Components Needed

### 1. FileUpload Component

**`components/FileUpload.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Upload, File, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FileUpload({ projectId, category, onUploadComplete }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleUpload = async (file: File) => {
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    formData.append('category', category)
    formData.append('title', file.name)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        onUploadComplete(data.document)
      }
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Click to upload or drag and drop
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDF, PNG, JPG up to 50MB
        </p>
      </label>
      {uploading && (
        <div className="mt-4">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

### 2. DocumentGallery Component

**`components/DocumentGallery.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { FileText, Download, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function DocumentGallery({ projectId }) {
  const [documents, setDocuments] = useState([])

  useEffect(() => {
    fetchDocuments()
  }, [projectId])

  const fetchDocuments = async () => {
    const res = await fetch(`/api/projects/${projectId}/documents`)
    const data = await res.json()
    setDocuments(data.documents)
  }

  const deleteDocument = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    fetchDocuments()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {documents.map(doc => (
        <Card key={doc.id} className="p-4">
          {doc.thumbnail_url ? (
            <img src={doc.thumbnail_url} className="w-full h-32 object-cover rounded" />
          ) : (
            <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center">
              <FileText className="h-12 w-12 text-gray-400" />
            </div>
          )}
          <h3 className="mt-2 font-medium truncate">{doc.title}</h3>
          <p className="text-sm text-gray-500">{formatBytes(doc.file_size)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.open(doc.blob_url)}>
              <Download className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteDocument(doc.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

---

## Use Cases

### 1. Uploading Architecture Diagrams

```typescript
// AI agent generates diagram, uploads to blob storage
const diagram = await generateArchitectureDiagram(projectId)

await callTool('upload_document', {
  projectId,
  title: "System Architecture Diagram",
  description: "Generated architecture diagram for the project",
  category: "diagram",
  fileData: diagram.toBase64(),
  fileName: "architecture.png",
  fileType: "image/png"
})
```

### 2. User Uploads PRD

```typescript
// User uploads PRD via UI
<FileUpload
  projectId={projectId}
  category="prd"
  onUploadComplete={(doc) => {
    // Link to project step
    linkDocumentToTask({ documentId: doc.id, stepId: currentStep.id })
  }}
/>
```

### 3. Exporting Project Reports

```typescript
// Generate PDF report and upload
const report = await generateProjectReport(projectId)
const pdfBuffer = await report.toPDF()

await callTool('upload_document', {
  projectId,
  title: `Project Report - ${new Date().toISOString()}`,
  category: "export",
  fileData: pdfBuffer.toString('base64'),
  fileName: `report-${Date.now()}.pdf`,
  fileType: "application/pdf"
})
```

---

## Cost Estimates

### Vercel Blob Pricing

**Free Tier:**
- 10 GB storage
- 100 GB bandwidth/month

**Pro Plan ($20/month):**
- 100 GB storage
- 1 TB bandwidth/month

**Estimated Usage:**
- Average document: 500 KB
- 100 projects × 20 documents = 2,000 documents = 1 GB
- Free tier sufficient for MVP and early growth

### AWS S3 Pricing (if migrating later)

**Storage:** $0.023/GB/month
**Bandwidth:** $0.09/GB (first 10 TB)

For 10 GB storage + 100 GB bandwidth: ~$9.23/month

---

## Security Considerations

1. **File Validation**
   - Validate MIME types server-side
   - Scan for malware (consider ClamAV integration)
   - Limit file sizes

2. **Access Control**
   - Use signed URLs for sensitive documents
   - Implement role-based permissions
   - Audit document access

3. **Data Protection**
   - Encrypt at rest (Vercel Blob does this)
   - Encrypt in transit (HTTPS)
   - Regular backups

---

## Migration Plan

### Phase 1: MVP (Week 1)
- [ ] Set up Vercel Blob
- [ ] Create upload/download API routes
- [ ] Add FileUpload component
- [ ] Test with sample documents

### Phase 2: Integration (Week 2)
- [ ] Add MCP tools for documents
- [ ] Integrate with project steps
- [ ] Add DocumentGallery component
- [ ] Implement thumbnail generation

### Phase 3: Polish (Week 3)
- [ ] Add drag-and-drop
- [ ] Implement progress indicators
- [ ] Add document versioning
- [ ] Optimize image handling

---

## Summary

**Recommended Approach:**
1. Use Vercel Blob for simplicity and Vercel integration
2. Update documents table with blob_url and metadata
3. Implement upload/download API routes
4. Add MCP tools for AI agent access
5. Build UI components for user uploads

**Next Steps:**
1. Run migration 016 to update documents table
2. Install `@vercel/blob`
3. Set up Vercel Blob store
4. Implement upload API route
5. Create FileUpload component
6. Add to UI-GAPS-ANALYSIS.md

This gives you full blob storage capability for design assets, documentation, and AI-generated content! 🎉
