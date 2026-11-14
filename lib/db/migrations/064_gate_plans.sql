-- Migration 064: what a page is supposed to have (the plan), and every change to it
--
-- WHY
-- Migration 063 stores what a scan FOUND on a page. This stores what was
-- EXPECTED, so a new build is held to everything it should have, and a control
-- nobody planned is noticed. Changes to the plan are recorded with the reason,
-- what they rest on, and whether the owner had to be asked and why
-- (lib/gates/gate-model.ts decideChange).
--
-- WHAT THIS DOES (additive only: two new tables)
--   gate_plans         one row per page: the expected controls (jsonb).
--   gate_plan_changes  one row per proposed change: applied at once, or
--                      waiting on an inbox question, then approved or rejected.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS gate_plans (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route       text NOT NULL,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, route)
);

CREATE TABLE IF NOT EXISTS gate_plan_changes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route        text NOT NULL,
  action       text NOT NULL CHECK (action IN ('add', 'remove', 'seed')),
  item         jsonb NOT NULL,
  reason       text NOT NULL,
  basis        text NOT NULL CHECK (basis IN ('owner_asked', 'rule', 'evidence', 'judgment')),
  quote        text,
  needs_owner  boolean NOT NULL DEFAULT false,
  why          text NOT NULL,
  status       text NOT NULL CHECK (status IN ('applied', 'waiting', 'approved', 'rejected')),
  question_id  uuid,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  -- Where the owner answered: 'planner' (signed in) or 'claude-code' (asked in the terminal and relayed, with their words).
  decided_via  text CHECK (decided_via IN ('planner', 'inbox', 'claude-code')),
  said         text
);
CREATE INDEX IF NOT EXISTS idx_gate_plan_changes_page ON gate_plan_changes(project_id, route, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_plans TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_plan_changes TO staging_app;
  END IF;
END $$;
