-- 088: code-check results, kept in the planner (card 586b4e83).
--
-- WHY
-- Owner, 2026-11-14: "I want records of what we tried, what works, what doesn't work and stats on the approaches as
-- we implement." A statement's checks reach a project as rules (lib/gates/guides.ts toRules), and the far-gates
-- plugin runs each rule on each file an agent writes. Until now the result stayed in the project's folder
-- (.gates/code.json) and never reached the planner, so no statement could show how its checks ended
-- (lib/gates/guide-ledger.ts had the counting and nothing to count). Rules: lib/gates/code-results.ts.
--
-- WHAT THIS DOES (additive only: two new tables and their indexes; nothing existing is altered, no row is written;
-- safe to run twice)
--   gate_code_results         where one rule stands on one file in one project, now. One row per project, rule and
--                             file; a newer result replaces it. user_id is whose rules they were (the key that sent
--                             it); guide_id is the statement or stack entry the rule came from, looked up as the
--                             result arrived (NULL for the plugin's built-in rules); file is the path inside the
--                             project's folder; status is owed, passed, failed or waived; actor and who say whether
--                             the owner or an agent (and which) sent it; source says where it came from (the check
--                             run when a file was written, gates verify, gates code send); checked_at is when the
--                             plugin ran the check.
--   gate_code_result_events   the history: one row each time that result CHANGES (the first result included),
--                             never updated. Two tables, not one append-only table, because the automatic checks
--                             run on every save of a file: an append-only log of every run would grow by several
--                             rows per save and say the same thing each time, and reading where a file stands now
--                             would mean finding the newest of them. Keeping only the changes is small, keeps
--                             every failure, and is what the statements' numbers are counted from.
--
-- A waived result can only be the owner's (the same rule gate_results has for page checks).
-- Neither table has a trigger and none of the tables they point at gains one.
--
-- Rollback: DROP TABLE gate_code_result_events; DROP TABLE gate_code_results;
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS gate_code_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id     text NOT NULL CHECK (char_length(rule_id) BETWEEN 1 AND 200),
  guide_id    uuid REFERENCES gate_guides(id) ON DELETE SET NULL,
  file        text NOT NULL CHECK (char_length(file) BETWEEN 1 AND 400),
  status      text NOT NULL CHECK (status IN ('owed', 'passed', 'failed', 'waived')),
  note        text,
  actor       text NOT NULL CHECK (actor IN ('owner', 'agent')),
  who         text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT '',
  checked_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'waived' OR actor = 'owner'),
  UNIQUE (project_id, rule_id, file)
);
CREATE INDEX IF NOT EXISTS idx_gate_code_results_user ON gate_code_results(user_id, status);

CREATE TABLE IF NOT EXISTS gate_code_result_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id     text NOT NULL CHECK (char_length(rule_id) BETWEEN 1 AND 200),
  guide_id    uuid REFERENCES gate_guides(id) ON DELETE SET NULL,
  file        text NOT NULL CHECK (char_length(file) BETWEEN 1 AND 400),
  status      text NOT NULL CHECK (status IN ('owed', 'passed', 'failed', 'waived')),
  note        text,
  actor       text NOT NULL CHECK (actor IN ('owner', 'agent')),
  who         text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT '',
  checked_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'waived' OR actor = 'owner'),
  -- The same change sent twice (a retry, or gates code send after it was already sent) is kept once.
  UNIQUE (project_id, rule_id, file, status, checked_at)
);
CREATE INDEX IF NOT EXISTS idx_gate_code_result_events_user ON gate_code_result_events(user_id, checked_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_code_results TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_code_result_events TO staging_app;
  END IF;
END $$;
