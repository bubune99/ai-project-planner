-- Migration 044: work_orders + work_order_steps (Idea D)
-- The runtime layer of the planner. Composed from feature_templates via topo-sort.
-- Steps are claimed by agents, checked in step-by-step with JIT instruction delivery.
-- Born with documentation_5wh envelope.
--
-- See memory: planner-meta-roadmap-septet — Idea D.
-- Idempotent.

BEGIN;

-- ============================================================================
-- work_orders — top-level work units
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  title TEXT NOT NULL,
  description TEXT,

  -- Composition source
  source_type TEXT NOT NULL DEFAULT 'ad_hoc' CHECK (source_type IN ('ad_hoc', 'feature_template', 'idea_promotion')),
  source_template_id UUID REFERENCES feature_templates(id) ON DELETE SET NULL,
  source_template_version INTEGER,
  source_idea_id UUID,                      -- soft link to ideas
  source_facet_id UUID,                     -- soft link to idea_facets (e.g. promoted from a spec_draft facet)

  -- Insertion strategy at compose-time
  insertion_strategy TEXT NOT NULL DEFAULT 'atomic' CHECK (insertion_strategy IN ('atomic', 'extends', 'replaces', 'enriches')),
  parallelism_recommended INTEGER NOT NULL DEFAULT 1,  -- max width of step DAG

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed',     -- composed, awaiting approval
    'approved',     -- approved, ready for agents to claim
    'in_progress',  -- at least one step claimed
    'paused',       -- explicitly paused by user
    'completed',    -- all steps done
    'cancelled',    -- abandoned
    'failed'        -- terminal failure of one or more steps
  )),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Ownership
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,                 -- always project-scoped
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent', 'system')),
  created_by_id TEXT,

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_work_orders_user           ON work_orders (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_project        ON work_orders (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_status         ON work_orders (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_template       ON work_orders (source_template_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_source_idea    ON work_orders (source_idea_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_created        ON work_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_5wh            ON work_orders USING GIN (documentation_5wh);

COMMENT ON TABLE work_orders IS 'Top-level execution unit. Composed from feature_templates or ad-hoc. Steps claimed by agents via check-in loop.';

-- ============================================================================
-- work_order_steps — DAG of executable steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_order_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,

  -- Position in DAG
  step_order INTEGER NOT NULL,              -- linear order (for display)
  level INTEGER NOT NULL DEFAULT 0,         -- DAG depth (computed by topo-sort)
  parallel_group INTEGER,                   -- nullable; steps with same parallel_group can run concurrently

  -- Identity
  title TEXT NOT NULL,
  description TEXT,
  step_type TEXT NOT NULL DEFAULT 'task' CHECK (step_type IN ('task', 'checkpoint', 'gate', 'protocol_check', 'verification')),

  -- Composition
  source_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  source_skill_version INTEGER,

  -- Dependencies (within this work order)
  prerequisites UUID[] NOT NULL DEFAULT '{}',     -- step IDs that must complete before this one
  provides TEXT[] NOT NULL DEFAULT '{}',          -- capability tags this step provides
  requires TEXT[] NOT NULL DEFAULT '{}',          -- capability tags this step needs (matched against earlier steps' provides[])

  -- Instructions (5W+H HOW dimension, surfaced for JIT delivery)
  instructions TEXT,
  acceptance_criteria TEXT[] NOT NULL DEFAULT '{}',
  step_references JSONB NOT NULL DEFAULT '[]',    -- [{ kind, id, label, url }] — renamed from "references" (reserved word)
  expected_artifacts TEXT[] NOT NULL DEFAULT '{}',

  -- Required capabilities (Gap #1 — agent capability matching)
  required_capabilities TEXT[] NOT NULL DEFAULT '{}',  -- e.g. ['typescript', 'sql-migration', 'stripe-api']

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- not yet ready (prerequisites unmet)
    'ready',        -- prerequisites met, available to claim
    'claimed',      -- claimed by an agent
    'in_progress',  -- agent has checked in
    'completed',    -- agent submitted completion check_in
    'failed',       -- step failed (terminal until retried)
    'skipped',      -- explicitly skipped
    'blocked'       -- blocked by external dependency
  )),

  -- Agent claim + check-in tracking
  claimed_by_type TEXT CHECK (claimed_by_type IN ('user', 'agent', 'system')),
  claimed_by_id TEXT,
  claimed_at TIMESTAMPTZ,
  last_check_in_at TIMESTAMPTZ,
  check_in_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,

  -- Outcome
  outcome_summary TEXT,
  outcome_artifacts JSONB NOT NULL DEFAULT '[]',   -- [{ kind, ref, url? }]
  retry_count INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT work_order_steps_order_unique UNIQUE (work_order_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_work_order_steps_order       ON work_order_steps (work_order_id, step_order);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_status      ON work_order_steps (status);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_claimed     ON work_order_steps (claimed_by_id, status);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_provides    ON work_order_steps USING GIN (provides);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_requires    ON work_order_steps USING GIN (requires);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_capabilities ON work_order_steps USING GIN (required_capabilities);
CREATE INDEX IF NOT EXISTS idx_work_order_steps_5wh         ON work_order_steps USING GIN (documentation_5wh);

COMMENT ON TABLE work_order_steps IS 'Executable steps in a work order. DAG via prerequisites[]. Claimed by agents; check-in loop fires JIT instructions per step.';

-- ============================================================================
-- work_order_check_ins — append-only event log of agent check-ins per step
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_order_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES work_order_steps(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,

  -- Event
  event_type TEXT NOT NULL CHECK (event_type IN (
    'claim',           -- agent claimed the step
    'progress',        -- progress update mid-step
    'blocker',         -- agent reports blocker
    'protocol_violation', -- protocol check failed
    'retry',           -- retrying after failure
    'completion',      -- step completed
    'failure',         -- step failed terminally
    'release'          -- agent released claim without completion
  )),

  -- Content
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}',      -- structured event data

  -- Prompt delivery tracking (Idea E v2)
  triggered_prompt_ids UUID[] NOT NULL DEFAULT '{}',  -- prompts fired by this event

  -- Actor
  by_type TEXT NOT NULL CHECK (by_type IN ('user', 'agent', 'system')),
  by_id TEXT,
  user_id UUID NOT NULL,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_work_order_check_ins_step      ON work_order_check_ins (step_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_check_ins_order     ON work_order_check_ins (work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_check_ins_event     ON work_order_check_ins (event_type);
CREATE INDEX IF NOT EXISTS idx_work_order_check_ins_actor     ON work_order_check_ins (by_id);

COMMENT ON TABLE work_order_check_ins IS 'Append-only event log per step. Powers prompt firing (Idea E) and failure-recovery prior-art (Gap #2 via attempted_solutions).';

-- ============================================================================
-- Update trigger on work_order_steps to bump check_in_count and last_check_in_at
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_bump_step_checkin_counters() RETURNS TRIGGER AS $$
BEGIN
  UPDATE work_order_steps
     SET check_in_count = check_in_count + 1,
         last_check_in_at = NEW.created_at,
         updated_at = NOW()
   WHERE id = NEW.step_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_step_checkin_counters ON work_order_check_ins;
CREATE TRIGGER trg_bump_step_checkin_counters
  AFTER INSERT ON work_order_check_ins
  FOR EACH ROW EXECUTE FUNCTION fn_bump_step_checkin_counters();

COMMIT;
