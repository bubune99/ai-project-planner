-- Migration 068: changes, shown before and after, with the owner's judgment
--
-- WHY
-- Checks say whether a screen works. They do not show the owner what was
-- changed to make it so, or let them say whether the change was a good one.
-- This keeps each change with a real screenshot of before and after, what it
-- answers and where it was proved, and the owner's judgment with their words.
-- Their judgments are the lessons the next change is made with
-- (lib/gates/change-model.ts).
--
-- WHAT THIS DOES (additive only: one new table)
--   gate_changes   one row per change: the title, what it answers, the page and
--                  check it belongs to, the stage of the after picture (mock,
--                  staging, production), the two stored pictures, and the
--                  owner's verdict (good or bad) with their note.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS gate_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  why         text NOT NULL,
  route       text,
  check_key   text,
  stage       text NOT NULL CHECK (stage IN ('mock', 'staging', 'production')),
  build       text,
  before_key  text NOT NULL,
  after_key   text NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('agent', 'owner')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  verdict     text CHECK (verdict IN ('good', 'bad')),
  note        text,
  decided_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gate_changes_project ON gate_changes(project_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_changes TO staging_app;
  END IF;
END $$;
