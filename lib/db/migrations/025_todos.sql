-- Migration 025: Personal Todos with Optional Project Linking
-- Creates a hybrid todo system: personal by default, can be linked to projects

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Owner (required) - todos are always personal
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Optional project link (nullable for personal/standalone todos)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Core todo fields
  title TEXT NOT NULL,
  description TEXT,

  -- Status: pending (default), in_progress, completed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),

  -- Priority: low, medium, high, urgent
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Date fields
  due_date TIMESTAMP,
  completed_at TIMESTAMP,

  -- Ordering for manual sort (within user's list)
  order_index INTEGER NOT NULL DEFAULT 0,

  -- Optional metadata (tags, notes, etc.)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP  -- Soft delete
);

-- =============================================================================
-- Indexes for efficient queries
-- =============================================================================

-- Primary user lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_todos_user_id
  ON todos(user_id) WHERE deleted_at IS NULL;

-- User + status for filtered views
CREATE INDEX IF NOT EXISTS idx_todos_user_status
  ON todos(user_id, status) WHERE deleted_at IS NULL;

-- User + due date for today/upcoming views
CREATE INDEX IF NOT EXISTS idx_todos_user_due_date
  ON todos(user_id, due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;

-- Project-linked todos
CREATE INDEX IF NOT EXISTS idx_todos_project_id
  ON todos(project_id) WHERE deleted_at IS NULL AND project_id IS NOT NULL;

-- User ordering for manual sort
CREATE INDEX IF NOT EXISTS idx_todos_user_order
  ON todos(user_id, order_index) WHERE deleted_at IS NULL;

-- Completed todos for history
CREATE INDEX IF NOT EXISTS idx_todos_completed
  ON todos(user_id, completed_at DESC) WHERE deleted_at IS NULL AND completed_at IS NOT NULL;

-- =============================================================================
-- Auto-update trigger for timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_todos_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  -- Auto-set completed_at when status changes to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at = NOW();
  END IF;

  -- Clear completed_at if status changes from completed
  IF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_todos_timestamps
  BEFORE UPDATE ON todos
  FOR EACH ROW
  EXECUTE FUNCTION update_todos_timestamps();

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE todos IS 'Personal todos that can optionally be linked to projects';
COMMENT ON COLUMN todos.user_id IS 'Owner of the todo (always required - todos are personal)';
COMMENT ON COLUMN todos.project_id IS 'Optional link to a project (null = standalone personal todo)';
COMMENT ON COLUMN todos.status IS 'Todo status: pending, in_progress, completed';
COMMENT ON COLUMN todos.priority IS 'Priority level: low, medium, high, urgent';
COMMENT ON COLUMN todos.order_index IS 'User-defined ordering for manual sorting';
COMMENT ON COLUMN todos.due_date IS 'Optional due date for the todo';
COMMENT ON COLUMN todos.completed_at IS 'Auto-set when status changes to completed';
