-- ============================================================================
-- Migration 036: sources (Backbone Foundation — schema only)
-- ============================================================================
-- Federation scaffolding for "this planner item is mirrored/linked from/to
-- an external system". No sync logic yet — adding a new source kind later
-- is a one-line change in the TS layer.
--
-- Supported upstream systems (kind) — non-enforced, documented set:
--   'github_issue'         — GitHub issue / PR
--   'agent_com_job'        — a job row in the Agent-Com MCP
--   'shopify_theme_commit' — commit in a Shopify theme repo
--   'vercel_deployment'    — a Vercel deployment for this project
--   'linear_ticket'        — Linear ticket
--   'manual'               — manually entered by the owner
--   'auto'                 — discovered/imported by a tool
--
-- A source MUST link to at least one planner entity (step | job | todo).

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Ownership (always scoped to a user)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Upstream system
  kind VARCHAR(64) NOT NULL,
  external_id TEXT,
  external_url TEXT,

  -- Planner targets (at least one must be set)
  step_id UUID REFERENCES project_steps(id) ON DELETE CASCADE,
  job_id UUID REFERENCES agent_jobs(id) ON DELETE CASCADE,
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,

  -- Upstream snapshot
  status VARCHAR(64),
  last_synced_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,

  CONSTRAINT source_has_target CHECK (
    step_id IS NOT NULL OR job_id IS NOT NULL OR todo_id IS NOT NULL
  )
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sources_user
  ON sources(user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_step
  ON sources(step_id) WHERE step_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_job
  ON sources(job_id) WHERE job_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_todo
  ON sources(todo_id) WHERE todo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_external
  ON sources(kind, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE sources IS 'Federation scaffolding: tracks external work items (GitHub issues, agent-com jobs, Vercel deployments, ...) that relate to planner entities. Schema-only in this pass; sync logic added later.';
COMMENT ON COLUMN sources.kind IS 'Upstream system identifier, e.g. github_issue, agent_com_job, vercel_deployment';
COMMENT ON COLUMN sources.external_id IS 'Upstream record id, opaque';
COMMENT ON COLUMN sources.external_url IS 'Deep link back to the upstream record';
COMMENT ON COLUMN sources.status IS 'Snapshot of upstream status, updated on sync';
