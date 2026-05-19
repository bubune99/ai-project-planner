-- ============================================================================
-- Migration 039: sops (Standard Operating Procedures)
-- ============================================================================
-- Backs the SOPs tab. A SOP is a titled, markdown-body procedure that can be
-- global (user-level) or scoped to a project. Status-tracked so drafts vs
-- live procedures are distinguishable. Soft-deleted to match todos/ideas.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS sops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Optional project scope; NULL = global/user-level SOP
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',     -- markdown body of the procedure
  category      TEXT,                         -- free-text grouping (e.g. "Onboarding")

  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('draft','active','archived')),

  order_index   INTEGER NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sops_user_id    ON sops(user_id);
CREATE INDEX IF NOT EXISTS idx_sops_project_id ON sops(project_id);
CREATE INDEX IF NOT EXISTS idx_sops_status     ON sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_created_at ON sops(created_at DESC);

COMMENT ON TABLE  sops            IS 'Standard Operating Procedures; global or project-scoped, status-tracked';
COMMENT ON COLUMN sops.project_id IS 'Optional project scope; NULL = global/user-level SOP';
COMMENT ON COLUMN sops.content    IS 'Markdown body of the procedure';
COMMENT ON COLUMN sops.status     IS 'draft -> active -> archived';
