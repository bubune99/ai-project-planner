-- Migration 045: prompts (Idea E v2) — first-class prompt atoms with lifecycle events
-- Extracts prompts from feature_templates.default_prompts JSONB into a queryable table.
-- Lifecycle events fire prompts during the work_order check-in loop.
-- Born with documentation_5wh envelope.
--
-- See memory: planner-meta-roadmap-septet — Idea E.
-- Idempotent.

BEGIN;

-- ============================================================================
-- prompts — first-class prompt atoms
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,                       -- short-kebab-case slug
  purpose TEXT NOT NULL,                    -- what this prompt achieves
  body TEXT NOT NULL,                       -- the actual prompt text

  -- Lifecycle binding (Idea E spec)
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'on_step_start',
    'on_step_retry',
    'on_blocker_detected',
    'on_step_completion',
    'on_work_order_completion',
    'on_protocol_violation_detected',
    'on_idea_promotion',
    'on_feature_template_application',
    'on_demand'
  )),

  -- Targeting (which entity types this prompt applies to)
  applies_to_types TEXT[] NOT NULL DEFAULT '{}',     -- 'work_order_step' | 'feature_template' | ...
  applies_to_categories TEXT[] NOT NULL DEFAULT '{}', -- filter by category
  applies_to_skill_names TEXT[] NOT NULL DEFAULT '{}', -- filter by attached skill names

  -- Source (where this prompt came from)
  source_type TEXT,                         -- 'user' | 'extracted_from_template' | 'extracted_from_skill' | 'agent_generated'
  source_template_id UUID REFERENCES feature_templates(id) ON DELETE SET NULL,
  source_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,

  -- Versioning + supersession
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by_prompt_id UUID REFERENCES prompts(id),

  -- References (other docs/prompts/examples this prompt cites)
  prompt_references JSONB NOT NULL DEFAULT '[]', -- [{ kind, id, label, url }] — renamed from "references" (reserved word)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated', 'experiment')),

  -- Outcome scoring (populated by prompt_outcomes materialized view + record_spec_outcome)
  fire_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_fired_at TIMESTAMPTZ,

  -- Ownership
  user_id UUID NOT NULL,
  project_id UUID,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'project', 'public')),

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT prompts_user_name_version_unique UNIQUE (user_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompts_user            ON prompts (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prompts_project         ON prompts (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prompts_trigger         ON prompts (trigger_event) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_prompts_applies_types   ON prompts USING GIN (applies_to_types);
CREATE INDEX IF NOT EXISTS idx_prompts_applies_skills  ON prompts USING GIN (applies_to_skill_names);
CREATE INDEX IF NOT EXISTS idx_prompts_5wh             ON prompts USING GIN (documentation_5wh);

COMMENT ON TABLE prompts IS 'First-class prompt atoms with lifecycle events. Fired by work_order check-in loop. Outcomes scored via prompt_outcomes view.';

-- ============================================================================
-- prompt_fires — every time a prompt fires, record it
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_fires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  prompt_version INTEGER NOT NULL,

  -- Where it fired
  fired_for_type TEXT NOT NULL,             -- 'work_order_step' | 'work_order' | ...
  fired_for_id UUID NOT NULL,
  trigger_event TEXT NOT NULL,
  check_in_id UUID REFERENCES work_order_check_ins(id) ON DELETE SET NULL,

  -- Outcome
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'helpful', 'unhelpful', 'caused_failure', 'unscored')),
  outcome_notes TEXT,
  outcome_recorded_at TIMESTAMPTZ,

  -- Who fired
  user_id UUID NOT NULL,
  agent_id TEXT,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_prompt_fires_prompt    ON prompt_fires (prompt_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_fires_fired_for ON prompt_fires (fired_for_type, fired_for_id);
CREATE INDEX IF NOT EXISTS idx_prompt_fires_outcome   ON prompt_fires (outcome);
CREATE INDEX IF NOT EXISTS idx_prompt_fires_user      ON prompt_fires (user_id);

COMMENT ON TABLE prompt_fires IS 'Every time a prompt fires; outcome-scored later. Feeds the prompt_outcomes view.';

-- ============================================================================
-- prompt_outcomes — materialized view summarizing outcomes per prompt
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS prompt_outcomes AS
SELECT
  p.id AS prompt_id,
  p.name,
  p.purpose,
  p.trigger_event,
  p.version,
  COUNT(pf.id) AS fire_count,
  COUNT(pf.id) FILTER (WHERE pf.outcome = 'helpful') AS helpful_count,
  COUNT(pf.id) FILTER (WHERE pf.outcome = 'unhelpful') AS unhelpful_count,
  COUNT(pf.id) FILTER (WHERE pf.outcome = 'caused_failure') AS failure_count,
  COUNT(pf.id) FILTER (WHERE pf.outcome = 'pending') AS pending_count,
  CASE WHEN COUNT(pf.id) FILTER (WHERE pf.outcome != 'pending') > 0
    THEN COUNT(pf.id) FILTER (WHERE pf.outcome = 'helpful')::numeric
       / NULLIF(COUNT(pf.id) FILTER (WHERE pf.outcome != 'pending'), 0)
    ELSE NULL
  END AS helpfulness_rate,
  MAX(pf.fired_at) AS last_fired_at,
  p.user_id
FROM prompts p
LEFT JOIN prompt_fires pf ON pf.prompt_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.purpose, p.trigger_event, p.version, p.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_outcomes_pk ON prompt_outcomes (prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_outcomes_helpfulness ON prompt_outcomes (helpfulness_rate DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW prompt_outcomes IS 'Per-prompt outcome summary. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY prompt_outcomes. Powers "Prompts to refine" filter in kanban (Idea B + E).';

COMMIT;
