-- 060: Launch readiness — validations, evidence and computed health
--
-- From the plans-and-evidence spec (agent-com artifact
-- project-plans-and-evidence-system.md, 2026-09-30): a project's launch type
-- decides which validations it needs; validations carry state, evidence and
-- who decided; health is computed from them (lib/readiness/model.ts), never
-- set by hand.
--
-- The checklist itself is lib/readiness/catalog.json (generated from the
-- Comprehension extension), so item_id is TEXT, not a foreign key: catalog
-- items are versioned with the code, rows hold only per-project decisions.
--
-- Purely additive: three new tables, no change to existing ones. Safe to run
-- twice, and safe where the tables are already there: every statement is
-- IF NOT EXISTS, a COMMENT (which only restates itself) or a GRANT (the same).
-- The number is out of order on purpose: this file was written on 2026-10-04
-- and the planner's record says it was applied to production then, but the
-- file itself never reached main. It depends only on projects(id).
-- projects.project_type is a different axis (product / client-* / internal /
-- research = who it's for); launch_type here is the launch-risk class.

CREATE TABLE IF NOT EXISTS project_readiness (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  launch_type TEXT NOT NULL CHECK (launch_type IN ('product', 'extension', 'store', 'client-site', 'invite-only')),
  regions TEXT[] NOT NULL DEFAULT ARRAY['US']::TEXT[],
  traits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  domain TEXT,
  site_url TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS project_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  -- 'stale' and 'unvalidated' are computed at read time, never stored.
  state TEXT NOT NULL CHECK (state IN ('proposed', 'passed', 'failed', 'waived')),
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  decided_by TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'agent')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'mcp', 'extension', 'api')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT project_validations_item_unique UNIQUE (project_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_project_validations_project ON project_validations(project_id);

-- Append-only history: every state change, by whom, with what evidence.
-- The spec requires sign-offs to be logged and overrides to be visible.
CREATE TABLE IF NOT EXISTS project_validation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'agent')),
  source TEXT NOT NULL DEFAULT 'manual',
  -- true when the owner set a state that contradicts the latest machine check
  override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_events_project_item ON project_validation_events(project_id, item_id, created_at DESC);

COMMENT ON TABLE project_readiness IS 'Launch profile per project: launch type, regions, traits, live domain. See lib/readiness/model.ts.';
COMMENT ON TABLE project_validations IS 'Current decision per launch-readiness checklist item (catalog in lib/readiness/catalog.json).';
COMMENT ON TABLE project_validation_events IS 'Append-only audit of validation state changes and sign-offs.';

-- The staging database's app role only sees tables it has been granted.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_readiness TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_validations TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_validation_events TO staging_app;
  END IF;
END $$;
