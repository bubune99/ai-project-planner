-- Migration 052: Kanban Wave 2 — custom statuses, tags, comments, time tracking
-- ClickUp-parity features for the project board.

-- ── 1. Custom per-project statuses ──────────────────────────────────────────
-- Each project can define its own status pipeline (label, color, order, kind).
-- steps.status stores the status KEY. Projects without custom rows fall back
-- to the six built-in statuses, so existing projects behave exactly as before.

CREATE TABLE IF NOT EXISTS project_statuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                 -- stable slug stored on project_steps.status
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#87909e',
  order_index INTEGER NOT NULL DEFAULT 0,
  -- kind drives semantics for legacy consumers:
  --   open   = not started (pending-like)
  --   active = in flight   (in-progress-like)
  --   done   = successfully finished (completed-like; sets completed_at)
  --   closed = terminal, not done (blocked/failed-like)
  kind TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'active', 'done', 'closed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT unique_project_status_key UNIQUE (project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_project_statuses_project
  ON project_statuses(project_id, order_index) WHERE deleted_at IS NULL;

-- Free the status column so custom keys are valid. The six built-in values
-- remain the defaults for projects with no custom pipeline.
ALTER TABLE project_steps DROP CONSTRAINT IF EXISTS project_steps_status_check;

COMMENT ON TABLE project_statuses IS 'Per-project kanban status pipeline (ClickUp-style custom statuses)';

-- Keep completed_at correct for custom statuses: done-kind sets it, others clear-preserve.
CREATE OR REPLACE FUNCTION step_status_kind(p_project_id UUID, p_status TEXT)
RETURNS TEXT AS $$
DECLARE v_kind TEXT;
BEGIN
  SELECT kind INTO v_kind FROM project_statuses
  WHERE project_id = p_project_id AND key = p_status AND deleted_at IS NULL;
  IF v_kind IS NOT NULL THEN RETURN v_kind; END IF;
  RETURN CASE p_status
    WHEN 'completed' THEN 'done'
    WHEN 'in-progress' THEN 'active'
    WHEN 'blocked' THEN 'closed'
    WHEN 'failed' THEN 'closed'
    WHEN 'paused' THEN 'open'
    ELSE 'open'
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 2. Tags ─────────────────────────────────────────────────────────────────
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_project_steps_tags ON project_steps USING GIN (tags);
COMMENT ON COLUMN project_steps.tags IS 'Freeform tags; colors derived deterministically client-side';

-- ── 3. Step comments (threaded) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS step_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  parent_comment_id UUID REFERENCES step_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_label TEXT,                 -- display name/agent name at write time
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_step_comments_step
  ON step_comments(step_id, created_at) WHERE deleted_at IS NULL;

-- ── 4. Time tracking ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS step_time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,                -- NULL while the timer is running
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_step_time_entries_step ON step_time_entries(step_id, started_at);
-- At most one running timer per user across the workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_step_time_entries_running
  ON step_time_entries(user_id) WHERE ended_at IS NULL;
