-- ============================================================================
-- Migration 034: agent_jobs — delegation + unlock-as-status (Backbone Foundation)
-- ============================================================================
-- Extends the existing agent_jobs table (migration 031) into the tactical
-- execution layer of the backbone hierarchy:
--
--   project_step (high-level intent)
--      └── agent_job (tactical execution)
--          └── agent_job (sub-jobs, existing parent_job_id)
--
-- Key additions:
-- * worker_id          — FK to workers(id), set on claim
-- * parent_step_id     — FK to project_steps(id), "this job executes this step"
-- * awaiting-unlock    — new status. Agents transition here when they need the
--                        owner to act/approve/decide. Owner resolves → queued.
-- * unlock_prompt      — human-readable "what I need from you"
-- * unlock_resolved_*  — audit trail for the resolution
-- * capabilities_required — structured requirement so matching is possible
--
-- Pre-existing fields reused (from 031):
--   id UUID, title, description, status, priority, input JSONB, result JSONB,
--   parent_job_id UUID, conversation_id, tags, started_at, completed_at,
--   metadata JSONB, created_at, updated_at, error TEXT, progress
--
-- NOTE: migration 031 declared `assigned_to VARCHAR(255)` (an opaque agent id).
-- We keep it for legacy callers and add `worker_id UUID` as the structured FK.

-- ============================================================================
-- 1. Extend the status CHECK constraint to allow 'awaiting-unlock' + 'queued'
-- ============================================================================

DO $$
BEGIN
  -- Drop the old constraint if it exists (name chosen by CREATE TABLE)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_jobs_status_check'
  ) THEN
    ALTER TABLE agent_jobs DROP CONSTRAINT agent_jobs_status_check;
  END IF;
END $$;

ALTER TABLE agent_jobs
  ADD CONSTRAINT agent_jobs_status_check
  CHECK (status IN (
    'pending',          -- created, not yet claimable (legacy)
    'queued',           -- claimable by any matching worker
    'assigned',         -- pre-claim targeted at a specific worker (legacy)
    'claimed',          -- a worker has reserved the job (used by MCP layer)
    'in_progress',      -- worker is executing
    'awaiting-unlock',  -- paused until owner acts (see unlock_prompt)
    'completed',
    'failed',
    'cancelled'
  ));

-- ============================================================================
-- 2. New columns
-- ============================================================================

ALTER TABLE agent_jobs
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_step_id UUID REFERENCES project_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlock_prompt TEXT,
  ADD COLUMN IF NOT EXISTS unlock_resolved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unlock_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlock_note TEXT,
  ADD COLUMN IF NOT EXISTS capabilities_required JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- 3. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_jobs_worker
  ON agent_jobs(worker_id) WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_jobs_parent_step
  ON agent_jobs(parent_step_id) WHERE parent_step_id IS NOT NULL;

-- Owner's "what needs me?" query
CREATE INDEX IF NOT EXISTS idx_agent_jobs_awaiting_unlock
  ON agent_jobs(created_at DESC) WHERE status = 'awaiting-unlock';

-- Queue of claimable work
CREATE INDEX IF NOT EXISTS idx_agent_jobs_queued
  ON agent_jobs(priority, created_at) WHERE status = 'queued';

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN agent_jobs.worker_id IS 'Worker (execution site) currently responsible for this job; set on claim';
COMMENT ON COLUMN agent_jobs.parent_step_id IS 'Project step this job executes (high-level intent → tactical execution)';
COMMENT ON COLUMN agent_jobs.unlock_prompt IS 'Human-readable message shown to the owner when status = awaiting-unlock';
COMMENT ON COLUMN agent_jobs.unlock_resolved_at IS 'When the owner resolved the unlock';
COMMENT ON COLUMN agent_jobs.unlock_resolved_by IS 'User id of the resolver';
COMMENT ON COLUMN agent_jobs.unlock_note IS 'Owner note captured at resolution time (approve/reject rationale)';
COMMENT ON COLUMN agent_jobs.capabilities_required IS 'JSONB: { tools?: string[], models?: string[], min_context_tokens?: number, supports_unlock?: boolean }';
