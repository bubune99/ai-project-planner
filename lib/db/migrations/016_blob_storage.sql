-- Migration 016: Blob Storage Integration
-- Add support for Vercel Blob storage for documents, images, and design assets

-- Add blob storage fields to documents table
ALTER TABLE documents
  ADD COLUMN blob_url TEXT,              -- Full Vercel Blob URL
  ADD COLUMN thumbnail_url TEXT,         -- For images/PDFs (200x200)
  ADD COLUMN public_url TEXT,            -- Public shareable link (optional)
  ADD COLUMN content_hash TEXT,          -- SHA256 hash for deduplication
  ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb; -- dimensions, page count, etc.

-- Rename s3_key to blob_key for clarity
ALTER TABLE documents RENAME COLUMN s3_key TO blob_key;

-- Add indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_documents_blob_key ON documents(blob_key);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- Add comments
COMMENT ON COLUMN documents.blob_url IS 'Full Vercel Blob URL for download';
COMMENT ON COLUMN documents.thumbnail_url IS 'Thumbnail URL (200x200) for images and PDFs';
COMMENT ON COLUMN documents.public_url IS 'Public shareable URL (optional, for presentations)';
COMMENT ON COLUMN documents.content_hash IS 'SHA256 hash for deduplication - prevent duplicate uploads';
COMMENT ON COLUMN documents.metadata IS 'File metadata: dimensions, page count, duration, etc.';

-- Create document_versions table for version control (optional but useful)
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

COMMENT ON TABLE document_versions IS 'Version history for documents - track changes over time';
COMMENT ON COLUMN document_versions.version_number IS 'Incremental version number (1, 2, 3...)';
COMMENT ON COLUMN document_versions.change_summary IS 'What changed in this version';

-- Function to create document version when document is updated
CREATE OR REPLACE FUNCTION create_document_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create version if blob_url changed
  IF OLD.blob_url IS DISTINCT FROM NEW.blob_url THEN
    INSERT INTO document_versions (
      document_id,
      version_number,
      blob_key,
      blob_url,
      file_size,
      uploaded_by,
      change_summary
    )
    SELECT
      OLD.id,
      COALESCE((
        SELECT MAX(version_number) + 1
        FROM document_versions
        WHERE document_id = OLD.id
      ), 1),
      OLD.blob_key,
      OLD.blob_url,
      OLD.file_size,
      OLD.uploaded_by || ' (system)',
      'Document updated';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_version_trigger
  BEFORE UPDATE OF blob_url ON documents
  FOR EACH ROW
  EXECUTE FUNCTION create_document_version();

COMMENT ON TRIGGER document_version_trigger ON documents IS 'Auto-create version when document blob_url changes';

-- Function to get document with versions
CREATE OR REPLACE FUNCTION get_document_with_versions(p_document_id UUID)
RETURNS TABLE(
  id UUID,
  project_id UUID,
  title TEXT,
  description TEXT,
  blob_key TEXT,
  blob_url TEXT,
  thumbnail_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  category TEXT,
  content_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  versions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.project_id,
    d.title,
    d.description,
    d.blob_key,
    d.blob_url,
    d.thumbnail_url,
    d.file_type,
    d.file_size,
    d.category,
    d.content_hash,
    d.metadata,
    d.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'version_number', dv.version_number,
            'blob_url', dv.blob_url,
            'file_size', dv.file_size,
            'uploaded_by', dv.uploaded_by,
            'change_summary', dv.change_summary,
            'created_at', dv.created_at
          )
          ORDER BY dv.version_number DESC
        )
        FROM document_versions dv
        WHERE dv.document_id = d.id
      ),
      '[]'::jsonb
    ) as versions
  FROM documents d
  WHERE d.id = p_document_id
    AND d.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_document_with_versions IS 'Get document with full version history';

-- Function to get documents by project with metadata
CREATE OR REPLACE FUNCTION get_project_documents(
  p_project_id UUID,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  blob_url TEXT,
  thumbnail_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  category TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP,
  version_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.blob_url,
    d.thumbnail_url,
    d.file_type,
    d.file_size,
    d.category,
    d.uploaded_by,
    d.created_at,
    (
      SELECT COUNT(*)::INTEGER
      FROM document_versions dv
      WHERE dv.document_id = d.id
    ) as version_count
  FROM documents d
  WHERE d.project_id = p_project_id
    AND d.deleted_at IS NULL
    AND (p_category IS NULL OR d.category = p_category)
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_documents IS 'Get all documents for a project with version counts';

-- View for document statistics
CREATE OR REPLACE VIEW document_statistics AS
SELECT
  p.id as project_id,
  p.name as project_name,
  COUNT(d.id) as total_documents,
  SUM(d.file_size) as total_size_bytes,
  COUNT(CASE WHEN d.category = 'prd' THEN 1 END) as prd_count,
  COUNT(CASE WHEN d.category = 'design' THEN 1 END) as design_count,
  COUNT(CASE WHEN d.category = 'spec' THEN 1 END) as spec_count,
  COUNT(CASE WHEN d.category = 'diagram' THEN 1 END) as diagram_count,
  COUNT(CASE WHEN d.category = 'export' THEN 1 END) as export_count,
  COUNT(CASE WHEN d.file_type LIKE 'image/%' THEN 1 END) as image_count,
  COUNT(CASE WHEN d.file_type = 'application/pdf' THEN 1 END) as pdf_count,
  MAX(d.created_at) as last_upload
FROM projects p
LEFT JOIN documents d ON d.project_id = p.id AND d.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;

COMMENT ON VIEW document_statistics IS 'Document usage statistics per project';
