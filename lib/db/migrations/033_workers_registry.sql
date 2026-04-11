-- ============================================================================
-- Migration 033: Workers Registry (Backbone Foundation)
-- Provider-agnostic execution-site registry
-- ============================================================================
-- Records any place work can actually be done: local Claude Code installs,
-- cloud Agent SDK runners, OpenAI/Gemini/Llama endpoints, humans, cron,
-- webhooks. Agents that claim agent_jobs reference their worker row so we
-- can route by capability and know who produced what.
--
-- Design notes:
-- * Uses UUID PKs to match the rest of the schema (projects, users, ...).
-- * user_id is nullable: system/shared workers (e.g. the local CLI) are
--   global; per-user workers scope to one owner.
-- * capabilities JSONB is intentionally loose — see TS type StepInstructions
--   and WorkerCapabilities in lib/db/schema.ts for the shape consumers use.
-- * Soft delete via deleted_at to match the rest of the backbone.

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Ownership (nullable = system/shared worker)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  kind VARCHAR(64) NOT NULL,
  -- Known kinds (non-enforced, just the seed set):
  --   'claude_code_local', 'claude_sdk_cloud',
  --   'openai_gpt4', 'openai_gpt5',
  --   'gemini_pro', 'local_llama',
  --   'human_owner', 'cron', 'webhook'
  name VARCHAR(255) NOT NULL,

  -- Capability descriptor (tools, models, max_context, supports_unlock, ...)
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Liveness
  status VARCHAR(20) NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'busy', 'error')),
  last_seen_at TIMESTAMP,

  -- Freeform
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workers_user
  ON workers(user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workers_kind
  ON workers(kind) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workers_status
  ON workers(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workers_active
  ON workers(kind, status) WHERE status = 'active' AND deleted_at IS NULL;

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workers_updated_at ON workers;
CREATE TRIGGER trigger_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_workers_updated_at();

-- ============================================================================
-- Seed the three worker types that already exist implicitly.
-- user_id is NULL so they're shared / discoverable to any caller; the owner
-- can create per-user duplicates later.
-- ============================================================================

INSERT INTO workers (kind, name, capabilities, status)
SELECT 'human_owner', 'Owner (manual unlock)',
       '{"supports_unlock": true}'::jsonb, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM workers
  WHERE kind = 'human_owner' AND name = 'Owner (manual unlock)' AND user_id IS NULL
);

INSERT INTO workers (kind, name, capabilities, status)
SELECT 'claude_code_local', 'Local Claude Code',
       '{"tools": ["all"], "models": ["claude-opus-4-6", "claude-sonnet-4-6"], "max_context": 1000000}'::jsonb,
       'active'
WHERE NOT EXISTS (
  SELECT 1 FROM workers
  WHERE kind = 'claude_code_local' AND name = 'Local Claude Code' AND user_id IS NULL
);

INSERT INTO workers (kind, name, capabilities, status)
SELECT 'claude_sdk_cloud', 'Cloud Claude Agent SDK',
       '{"tools": ["all"], "models": ["claude-opus-4-6"], "max_context": 200000}'::jsonb,
       'inactive'
WHERE NOT EXISTS (
  SELECT 1 FROM workers
  WHERE kind = 'claude_sdk_cloud' AND name = 'Cloud Claude Agent SDK' AND user_id IS NULL
);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE workers IS 'Execution-site registry: any place work can actually be done. Agents claim agent_jobs and reference their worker row.';
COMMENT ON COLUMN workers.kind IS 'Worker category, e.g. claude_code_local, openai_gpt5, human_owner, cron, webhook';
COMMENT ON COLUMN workers.capabilities IS 'JSONB: { tools?: string[], models?: string[], max_context?: number, supports_streaming?: boolean, supports_unlock?: boolean, ... }';
COMMENT ON COLUMN workers.user_id IS 'NULL for system/shared workers; set for per-user workers';
