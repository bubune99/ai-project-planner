-- Migration 043: Library (Idea A) — skills, feature_templates, protocols
-- The "evolved prompt library" core tables. Born with documentation_5wh envelope.
-- See memory: planner-meta-roadmap-septet — Idea A.
--
-- Three table family:
--   skills            — atomic capability definitions (e.g. "drizzle-migration", "stripe-webhook-verification")
--   feature_templates — reusable feature blueprints composed of skills (e.g. "OAuth login flow")
--   protocols         — sequenced enforcement rules (e.g. "always run truth-seeker before migration")
--
-- All three are user-scoped (with optional project_id for project-specific variants).
-- Idempotent — safe to re-run.

BEGIN;

-- ============================================================================
-- skills — atomic capability definitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,                       -- short-kebab-case slug (e.g. "drizzle-migration")
  title TEXT NOT NULL,                      -- display name (e.g. "Drizzle Migration")
  category TEXT,                            -- 'database' | 'api' | 'auth' | 'payments' | 'ui' | 'testing' | 'devops' | ...

  -- Description
  description TEXT NOT NULL,
  when_to_use TEXT,                         -- markdown — when this skill applies
  body TEXT NOT NULL DEFAULT '',            -- markdown — the actual instruction body (the "prompt body" of this skill)

  -- Composition hints
  prerequisites TEXT[] NOT NULL DEFAULT '{}',    -- other skill names that must be in scope before this one applies
  provides TEXT[] NOT NULL DEFAULT '{}',         -- capability tags this skill provides (consumed by topo-sort in work_order composer)
  examples JSONB NOT NULL DEFAULT '[]',          -- [{ label, code_or_text, references[] }]

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by_skill_id UUID REFERENCES skills(id),

  -- Outcome scoring (populated by Idea C's record_spec_outcome over time)
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Ownership
  user_id UUID NOT NULL,
  project_id UUID,                          -- nullable: skill can be global or project-specific
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'project', 'public')),

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Unique per-user per-name (no version dup)
  CONSTRAINT skills_user_name_version_unique UNIQUE (user_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_skills_user      ON skills (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skills_project   ON skills (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skills_status    ON skills (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skills_category  ON skills (category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_skills_provides  ON skills USING GIN (provides);
CREATE INDEX IF NOT EXISTS idx_skills_prereqs   ON skills USING GIN (prerequisites);
CREATE INDEX IF NOT EXISTS idx_skills_5wh       ON skills USING GIN (documentation_5wh);

COMMENT ON TABLE skills IS 'Atomic capability definitions. Composed into feature_templates and consumed by work_order step composer via prerequisites[]/provides[] topo-sort.';

-- ============================================================================
-- feature_templates — reusable feature blueprints
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,                       -- short-kebab-case slug (e.g. "stripe-subscription-checkout")
  title TEXT NOT NULL,                      -- display name
  category TEXT,                            -- 'auth' | 'payments' | 'commerce' | 'communication' | ...
  description TEXT NOT NULL,

  -- The blueprint
  steps JSONB NOT NULL DEFAULT '[]',        -- [{ order, title, skill_ref, acceptance, default_prompts? }]
  required_skills TEXT[] NOT NULL DEFAULT '{}',  -- skill names referenced in steps
  default_acceptance_criteria TEXT[] NOT NULL DEFAULT '{}',
  default_risks TEXT[] NOT NULL DEFAULT '{}',
  applicable_protocols TEXT[] NOT NULL DEFAULT '{}',  -- protocol names that apply

  -- Default prompts (embedded — extracted to first-class prompts table in Phase 10/E v2)
  default_prompts JSONB NOT NULL DEFAULT '[]',  -- [{ trigger_event, body, version }]

  -- Composition
  insertion_strategy TEXT NOT NULL DEFAULT 'atomic' CHECK (insertion_strategy IN ('atomic', 'extends', 'replaces', 'enriches')),
  parallelism_hint INTEGER NOT NULL DEFAULT 1,  -- max agents recommended

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by_template_id UUID REFERENCES feature_templates(id),
  promoted_from_idea_id UUID,               -- soft link to ideas table (no FK — ideas may be deleted)

  -- Outcome scoring
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

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

  CONSTRAINT feature_templates_user_name_version_unique UNIQUE (user_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_feature_templates_user           ON feature_templates (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feature_templates_project        ON feature_templates (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feature_templates_status         ON feature_templates (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feature_templates_category       ON feature_templates (category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feature_templates_required       ON feature_templates USING GIN (required_skills);
CREATE INDEX IF NOT EXISTS idx_feature_templates_promoted_from  ON feature_templates (promoted_from_idea_id);
CREATE INDEX IF NOT EXISTS idx_feature_templates_5wh            ON feature_templates USING GIN (documentation_5wh);

COMMENT ON TABLE feature_templates IS 'Reusable feature blueprints. Compose skills into steps. Consumed by work_order composer (Idea D).';

-- ============================================================================
-- protocols — sequenced enforcement rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL,                       -- short-kebab-case slug (e.g. "always-validate-migration-safety")
  title TEXT NOT NULL,                      -- display name
  category TEXT,                            -- 'security' | 'data-integrity' | 'deployment' | 'testing' | ...
  description TEXT NOT NULL,

  -- The rule
  trigger_event TEXT NOT NULL,              -- when this protocol fires (e.g. 'before_migration', 'before_deploy', 'on_external_api_change')
  rule_body TEXT NOT NULL,                  -- the actual enforced text / prompt body
  violation_severity TEXT NOT NULL DEFAULT 'warning' CHECK (violation_severity IN ('info', 'warning', 'error', 'fatal')),
  auto_action TEXT,                         -- what happens on violation: 'block' | 'warn' | 'log' | 'notify'

  -- Scope
  applies_to_types TEXT[] NOT NULL DEFAULT '{}',  -- which entity types this applies to ('feature_template', 'work_order_step', etc.)
  applies_to_categories TEXT[] NOT NULL DEFAULT '{}',  -- which categories (e.g. only 'payments' features)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by_protocol_id UUID REFERENCES protocols(id),

  -- Outcome scoring
  triggered_count INTEGER NOT NULL DEFAULT 0,
  violated_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

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

  CONSTRAINT protocols_user_name_version_unique UNIQUE (user_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_protocols_user            ON protocols (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_protocols_project         ON protocols (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_protocols_status          ON protocols (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_protocols_trigger_event   ON protocols (trigger_event) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_protocols_category        ON protocols (category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_protocols_applies_types   ON protocols USING GIN (applies_to_types);
CREATE INDEX IF NOT EXISTS idx_protocols_5wh             ON protocols USING GIN (documentation_5wh);

COMMENT ON TABLE protocols IS 'Sequenced enforcement rules fired at trigger_event. Composed into work_orders alongside skills.';

-- ============================================================================
-- spec_applications — audit trail for spec generation events (Idea C reflection tier)
-- ============================================================================

CREATE TABLE IF NOT EXISTS spec_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was applied
  spec_source_type TEXT NOT NULL CHECK (spec_source_type IN ('skill', 'feature_template', 'protocol')),
  spec_source_id UUID NOT NULL,
  spec_source_version INTEGER NOT NULL,

  -- Where it was applied
  applied_to_type TEXT NOT NULL,            -- 'work_order' | 'work_order_step' | 'project' | ...
  applied_to_id UUID NOT NULL,

  -- Outcome (initially 'pending', updated by record_spec_outcome later)
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'success', 'failure', 'partial', 'abandoned')),
  outcome_notes TEXT,
  outcome_recorded_at TIMESTAMPTZ,

  -- Who applied
  user_id UUID NOT NULL,
  agent_id TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit + envelope
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_spec_applications_source  ON spec_applications (spec_source_type, spec_source_id);
CREATE INDEX IF NOT EXISTS idx_spec_applications_applied ON spec_applications (applied_to_type, applied_to_id);
CREATE INDEX IF NOT EXISTS idx_spec_applications_user    ON spec_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_spec_applications_outcome ON spec_applications (outcome);

COMMENT ON TABLE spec_applications IS 'Audit trail: every time a skill/template/protocol is applied. Outcomes feed usage/success/failure counters back to the spec rows.';

COMMIT;
