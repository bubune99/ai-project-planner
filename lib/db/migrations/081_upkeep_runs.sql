-- 081: a record of every upkeep run (card c28cb7e1 part 5).
--
-- Owner, 2026-11-14: platform agents run upkeep, such as the stale-task check, and raise queue items for what needs
-- him. Each run keeps what it checked, what it found and what it asked, so its usefulness can be counted (the rules
-- ledger, task 344946c5). One row per run; nothing else reads or writes these rows.

CREATE TABLE IF NOT EXISTS upkeep_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  user_id     text NOT NULL,
  project_id  uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  ran_by      text NOT NULL,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  checked     integer NOT NULL DEFAULT 0,
  found       jsonb NOT NULL DEFAULT '{}'::jsonb,
  asked       uuid[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS upkeep_runs_user_kind ON upkeep_runs (user_id, kind, ran_at DESC);
