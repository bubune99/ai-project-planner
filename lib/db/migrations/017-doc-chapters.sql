-- Documentation chapters and pages system

CREATE TABLE IF NOT EXISTS doc_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '📄',
    order_index INTEGER NOT NULL DEFAULT 0,
    parent_chapter_id UUID REFERENCES doc_chapters(id) ON DELETE CASCADE,
    is_expanded BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS doc_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES doc_chapters(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT DEFAULT '📝',
    content TEXT DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_edited_by TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_doc_chapters_project ON doc_chapters(project_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_chapters_parent ON doc_chapters(parent_chapter_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_pages_chapter ON doc_pages(chapter_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_pages_project ON doc_pages(project_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_doc_pages_slug ON doc_pages(project_id, slug) WHERE deleted_at IS NULL;

-- Update triggers
CREATE TRIGGER update_doc_chapters_updated_at
    BEFORE UPDATE ON doc_chapters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_doc_pages_updated_at
    BEFORE UPDATE ON doc_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
