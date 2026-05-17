-- Migration: Update documents table to support documentation pages
-- This adds fields for chapter/page hierarchy and inline content

-- Add new columns to documents table
ALTER TABLE documents
  ALTER COLUMN s3_key DROP NOT NULL,
  ALTER COLUMN file_type DROP NOT NULL,
  ALTER COLUMN file_size DROP NOT NULL,
  ALTER COLUMN category DROP NOT NULL;

-- Add new columns for documentation
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS doc_type TEXT CHECK (doc_type IN ('chapter', 'page')),
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_edited_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for parent_id lookups
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);

-- Create index for doc_type filtering
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);

-- Update category to allow more flexible values
ALTER TABLE documents
  ALTER COLUMN category TYPE TEXT;

COMMENT ON COLUMN documents.content IS 'Markdown content for inline documentation pages';
COMMENT ON COLUMN documents.doc_type IS 'Type of document: chapter (container) or page (content)';
COMMENT ON COLUMN documents.parent_id IS 'Parent chapter ID for hierarchical organization';
COMMENT ON COLUMN documents.s3_key IS 'S3 key for uploaded files (optional for inline docs)';
