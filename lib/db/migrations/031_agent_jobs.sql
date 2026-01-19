-- ============================================================================
-- Migration 031: Agent Jobs (JARVIS)
-- Part of the JARVIS Personal Assistant Platform
-- Agent: JARVIS-API (Agent 4)
-- ============================================================================
-- Creates tables for agent job management and coordination
-- Supports job creation, assignment, checkpointing, and completion tracking

-- ============================================================================
-- Agent Jobs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Ownership and assignment
  created_by VARCHAR(255) NOT NULL, -- agent ID or user ID
  assigned_to VARCHAR(255), -- agent ID

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Job data
  input JSONB DEFAULT '{}', -- Input data for the job
  result JSONB, -- Result data after completion
  error TEXT, -- Error message if failed

  -- Hierarchy support
  parent_job_id UUID REFERENCES agent_jobs(id) ON DELETE SET NULL,

  -- Progress tracking
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Linked conversation
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,

  -- Tags for filtering
  tags TEXT[] DEFAULT '{}',

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  ttl INTERVAL DEFAULT '24 hours',
  expires_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent Job Checkpoints Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_job_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  agent_id VARCHAR(255) NOT NULL,
  progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
  message TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Job status and assignment indexes
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_priority ON agent_jobs(priority);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_assigned_to ON agent_jobs(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_jobs_created_by ON agent_jobs(created_by);

-- Filter for active jobs (not completed/failed/cancelled)
CREATE INDEX IF NOT EXISTS idx_agent_jobs_active ON agent_jobs(status, priority)
  WHERE status IN ('pending', 'assigned', 'in_progress');

-- Parent job for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_agent_jobs_parent ON agent_jobs(parent_job_id)
  WHERE parent_job_id IS NOT NULL;

-- Tags for filtering (GIN index for array containment)
CREATE INDEX IF NOT EXISTS idx_agent_jobs_tags ON agent_jobs USING GIN(tags);

-- Expiration index
CREATE INDEX IF NOT EXISTS idx_agent_jobs_expires ON agent_jobs(expires_at)
  WHERE expires_at IS NOT NULL;

-- Checkpoint indexes
CREATE INDEX IF NOT EXISTS idx_job_checkpoints_job_id ON agent_job_checkpoints(job_id);
CREATE INDEX IF NOT EXISTS idx_job_checkpoints_created ON agent_job_checkpoints(job_id, created_at DESC);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_job_updated_at ON agent_jobs;
CREATE TRIGGER trigger_agent_job_updated_at
  BEFORE UPDATE ON agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_job_updated_at();

-- Auto-set expires_at based on ttl when job is created
CREATE OR REPLACE FUNCTION set_agent_job_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL AND NEW.ttl IS NOT NULL THEN
    NEW.expires_at = NOW() + NEW.ttl;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_job_expiration ON agent_jobs;
CREATE TRIGGER trigger_set_job_expiration
  BEFORE INSERT ON agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_agent_job_expiration();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE agent_jobs IS 'Stores jobs that agents can claim and execute';
COMMENT ON TABLE agent_job_checkpoints IS 'Checkpoint data for resumable jobs';
COMMENT ON COLUMN agent_jobs.created_by IS 'Agent or user ID who created the job';
COMMENT ON COLUMN agent_jobs.assigned_to IS 'Agent ID currently assigned to the job';
COMMENT ON COLUMN agent_jobs.input IS 'Input data for the job';
COMMENT ON COLUMN agent_jobs.result IS 'Result data after job completion';
COMMENT ON COLUMN agent_jobs.parent_job_id IS 'Parent job for hierarchical job structures';
COMMENT ON COLUMN agent_jobs.ttl IS 'Time-to-live before job expires';
