-- 085: Statement history, and trial or permanent (cards e6ff4d40 slice 3, 344946c5 slice 1).
--
-- WHY
-- Owner, 2026-11-14: "all of these gate changes need true recording or action in the platform. Whether something
-- becomes temporary for testing or permanent in set up is one or the other... I want records of what we tried, what
-- works, what doesn't work." Until now saving a statement replaced it (guide-store.ts overwrote the row), and
-- "draft" stood in for a trial without holding anyone to it. Rules: lib/gates/guides.ts.
--
-- WHAT THIS DOES (additive only; safe to run twice; no existing row is changed)
--   gate_guides.trial_until   new nullable date. NULL (every row that exists today) means permanent. A date means
--                             on trial until that day: enforced the same, shown as on trial, and as due for review
--                             once the day has passed.
--   gate_guide_versions       new table: one row per saved version of a guide (stack entry or statement), with
--                             who saved it (owner, agent and its name, or 'before' for the state a guide was in when
--                             history began), what kind of change it was, and the whole content as saved.
--                             Nothing is written here by this migration: a guide's history starts at its next save,
--                             which first keeps the state it was in as version 1.
--
-- gate_guides has no triggers (065 created none; no later migration names the table), so the new column fires nothing.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

ALTER TABLE gate_guides ADD COLUMN IF NOT EXISTS trial_until date;

CREATE TABLE IF NOT EXISTS gate_guide_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id       uuid NOT NULL REFERENCES gate_guides(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  saved_by       text NOT NULL CHECK (saved_by IN ('owner', 'agent', 'before')),
  saved_by_name  text NOT NULL DEFAULT '',
  change         text NOT NULL CHECK (change IN ('saved', 'status', 'trial', 'permanent', 'restored', 'before')),
  restored_from  integer,
  content        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guide_id, version)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_guide_versions TO staging_app;
  END IF;
END $$;
