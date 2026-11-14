-- Migration 067: walks (an agent uses the product toward a goal, as a person would)
--
-- WHY
-- Checks (063) prove what a script was told to check. They cannot find what
-- nobody thought to ask for: a step that is missing, an action that could not
-- be found, the place a person would give up. A walk is an agent given a goal,
-- the steps it actually took, how it ended and what it found. Findings feed the
-- plan (something missing), the fix queue (something broken) and the owner's
-- preferences (something hard, or a matter of taste). Rules: lib/walks/walk-model.ts.
--
-- WHAT THIS DOES (additive only: one new table)
--   walks   one row per walk: the goal, the use case and persona it belongs to
--           (ids from people_flows, when it has them), how it ended, the build
--           it was done on, and the steps and findings (jsonb).
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS walks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  goal        text NOT NULL,
  use_case    text,
  persona     text,
  outcome     text NOT NULL CHECK (outcome IN ('reached', 'blocked', 'gave_up')),
  env         text,
  build       text,
  doc         jsonb NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('agent', 'owner')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_walks_project ON walks(project_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON walks TO staging_app;
  END IF;
END $$;
