-- Migration 066: people and flows (who a project is for, and what they come to do)
--
-- WHY
-- Checks (063-065) prove that controls work. Nothing recorded who the product
-- is for or what they come to do, so a page could pass every check and still
-- miss a journey nobody wrote down. This stores people, personas, use cases
-- (steps that point at the controls that do them) and the per-page comparison
-- of users, as one document per project, with a record of every change.
-- The rules are in lib/people/people-model.ts.
--
-- WHAT THIS DOES (additive only: two new tables)
--   people_flows         one row per project: the document (jsonb) and its version.
--   people_flow_changes  one row per saved change: who made it (the owner or an
--                        agent), and what changed, in plain sentences.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS people_flows (
  project_id  uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  doc         jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people_flow_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('owner', 'agent')),
  created_by  text,
  lines       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_flow_changes_project ON people_flow_changes(project_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON people_flows TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON people_flow_changes TO staging_app;
  END IF;
END $$;
