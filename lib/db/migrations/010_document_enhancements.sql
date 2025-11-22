-- Migration 010: Document Enhancements
-- Adds tags, task linking, and inline content for documentation management

-- Add tags array to documents
ALTER TABLE documents
  ADD COLUMN tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add inline content for markdown/text documents
ALTER TABLE documents
  ADD COLUMN content TEXT;

-- Add document type enum for better organization
ALTER TABLE documents
  ADD COLUMN doc_type TEXT CHECK (doc_type IN ('architecture', 'api', 'ui_ux', 'requirements', 'testing', 'deployment', 'general'));

-- Add version tracking
ALTER TABLE documents
  ADD COLUMN version INTEGER DEFAULT 1;

-- Add last editor
ALTER TABLE documents
  ADD COLUMN last_edited_by TEXT;

-- Add updated_at timestamp
ALTER TABLE documents
  ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Create junction table for document-task relationships
CREATE TABLE document_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  relationship_type TEXT CHECK (relationship_type IN ('reference', 'implementation', 'specification', 'testing')) DEFAULT 'reference',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, task_id)
);

-- Create indexes for document queries
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type) WHERE doc_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- Create indexes for document-task relationships
CREATE INDEX IF NOT EXISTS idx_document_tasks_document ON document_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tasks_task ON document_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_document_tasks_type ON document_tasks(relationship_type);

-- Add comments
COMMENT ON COLUMN documents.tags IS 'Array of tags for categorization and search';
COMMENT ON COLUMN documents.content IS 'Inline content for markdown/text documents (NULL for binary files)';
COMMENT ON COLUMN documents.doc_type IS 'Type of document for better organization';
COMMENT ON COLUMN documents.version IS 'Version number for tracking changes';
COMMENT ON TABLE document_tasks IS 'Links documents to project tasks/steps';
COMMENT ON COLUMN document_tasks.relationship_type IS 'How this document relates to the task';

-- Create function to get documents for a task
CREATE OR REPLACE FUNCTION get_task_documents(p_task_id UUID)
RETURNS TABLE(
  document_id UUID,
  title TEXT,
  doc_type TEXT,
  tags TEXT[],
  relationship_type TEXT,
  s3_key TEXT,
  content TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.doc_type,
    d.tags,
    dt.relationship_type,
    d.s3_key,
    d.content
  FROM documents d
  JOIN document_tasks dt ON dt.document_id = d.id
  WHERE dt.task_id = p_task_id
    AND d.deleted_at IS NULL
  ORDER BY dt.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_task_documents IS 'Returns all documents linked to a specific task';

-- Create function to search documents by tags
CREATE OR REPLACE FUNCTION search_documents_by_tags(p_project_id UUID, p_tags TEXT[])
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  tags TEXT[],
  doc_type TEXT,
  category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.tags,
    d.doc_type,
    d.category
  FROM documents d
  WHERE d.project_id = p_project_id
    AND d.tags && p_tags  -- Array overlap operator
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_documents_by_tags IS 'Searches documents by tags using array overlap';

-- Create trigger to update document updated_at
CREATE OR REPLACE FUNCTION update_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_document_updated_at();
