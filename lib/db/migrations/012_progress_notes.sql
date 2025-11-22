-- Migration 012: Progress Notes
-- Allows AI agents and humans to document detailed progress, blockers, and decisions

-- Create progress notes table
CREATE TABLE progress_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_id UUID REFERENCES project_steps(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')) DEFAULT 'agent',
  author_name TEXT NOT NULL, -- Human name or agent name (v0, claude, gemini, gpt)
  note_type TEXT NOT NULL CHECK (note_type IN ('progress', 'blocker', 'question', 'decision', 'completion')) DEFAULT 'progress',
  title TEXT,
  content TEXT NOT NULL, -- Markdown supported
  metadata JSONB DEFAULT '{}'::jsonb, -- code snippets, file references, links, etc.
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_progress_notes_project ON progress_notes(project_id) WHERE step_id IS NULL;
CREATE INDEX idx_progress_notes_step ON progress_notes(step_id) WHERE step_id IS NOT NULL;
CREATE INDEX idx_progress_notes_author ON progress_notes(author_name, author_type);
CREATE INDEX idx_progress_notes_type ON progress_notes(note_type);
CREATE INDEX idx_progress_notes_created ON progress_notes(created_at DESC);

-- Add comments
COMMENT ON TABLE progress_notes IS 'Detailed progress updates from AI agents and humans';
COMMENT ON COLUMN progress_notes.author_type IS 'Whether note was written by a human or AI agent';
COMMENT ON COLUMN progress_notes.author_name IS 'Name of human or agent (v0, claude, gemini, gpt)';
COMMENT ON COLUMN progress_notes.note_type IS 'Type of note: progress update, blocker, question, decision, or completion summary';
COMMENT ON COLUMN progress_notes.content IS 'Markdown-formatted note content';
COMMENT ON COLUMN progress_notes.metadata IS 'Additional context: code snippets, file paths, commit hashes, etc.';

-- Create function to get recent progress notes for a project
CREATE OR REPLACE FUNCTION get_recent_progress(p_project_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID,
  step_id UUID,
  step_title TEXT,
  author_type TEXT,
  author_name TEXT,
  note_type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pn.id,
    pn.step_id,
    ps.title as step_title,
    pn.author_type,
    pn.author_name,
    pn.note_type,
    pn.title,
    pn.content,
    pn.metadata,
    pn.created_at
  FROM progress_notes pn
  LEFT JOIN project_steps ps ON ps.id = pn.step_id
  WHERE pn.project_id = p_project_id
  ORDER BY pn.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_recent_progress IS 'Returns recent progress notes for a project with step context';

-- Create function to get progress timeline for a step
CREATE OR REPLACE FUNCTION get_step_progress_timeline(p_step_id UUID)
RETURNS TABLE(
  id UUID,
  author_type TEXT,
  author_name TEXT,
  note_type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pn.id,
    pn.author_type,
    pn.author_name,
    pn.note_type,
    pn.title,
    pn.content,
    pn.metadata,
    pn.created_at
  FROM progress_notes pn
  WHERE pn.step_id = p_step_id
  ORDER BY pn.created_at ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_step_progress_timeline IS 'Returns chronological progress timeline for a specific step';
