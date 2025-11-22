-- Migration 017: Document Hierarchy
-- Adds parent_id to documents table for chapter/page structure

-- Add parent_id for hierarchical documents (chapters contain pages)
ALTER TABLE documents
  ADD COLUMN parent_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- Add index for parent lookups
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id) WHERE deleted_at IS NULL;

-- Add comments
COMMENT ON COLUMN documents.parent_id IS 'Parent document ID for hierarchical structure (chapters contain pages)';

-- Function to get document hierarchy
CREATE OR REPLACE FUNCTION get_document_hierarchy(p_project_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  doc_type TEXT,
  parent_id UUID,
  content TEXT,
  tags TEXT[],
  level INTEGER
) AS $$
WITH RECURSIVE doc_tree AS (
  -- Base case: top-level documents (chapters)
  SELECT 
    d.id,
    d.title,
    d.description,
    d.doc_type,
    d.parent_id,
    d.content,
    d.tags,
    0 as level
  FROM documents d
  WHERE d.project_id = p_project_id
    AND d.parent_id IS NULL
    AND d.deleted_at IS NULL
  
  UNION ALL
  
  -- Recursive case: child documents (pages)
  SELECT 
    d.id,
    d.title,
    d.description,
    d.doc_type,
    d.parent_id,
    d.content,
    d.tags,
    dt.level + 1
  FROM documents d
  JOIN doc_tree dt ON d.parent_id = dt.id
  WHERE d.deleted_at IS NULL
)
SELECT * FROM doc_tree
ORDER BY level, title;
$$ LANGUAGE SQL;

COMMENT ON FUNCTION get_document_hierarchy IS 'Returns hierarchical document structure (chapters and pages)';
