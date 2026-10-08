-- Migration 061: durable rate-limit counters, windowed AI token usage, reset log
--
-- WHY
-- lib/rate-limit.ts kept its counters in an in-memory Map. On Vercel every
-- function instance has its own Map and cold starts reset it, so the chat limit
-- (30/min) was really 30/min per warm instance. AI spend had no ceiling at all.
-- Owner decision: no Upstash; durable counters live in Postgres.
--
-- WHAT THIS DOES (additive only: three new tables, nothing altered or dropped)
--   rate_limit_counters  fixed-window counters, one row per (key, window).
--                        Incremented atomically with INSERT ... ON CONFLICT DO
--                        UPDATE ... RETURNING count. Expired rows are deleted
--                        opportunistically by lib/rate-limit.ts (no cron).
--   ai_token_usage       tokens spent per scope per window. scope is
--                        'user:<userId>' (AI_BUDGET_WINDOW_HOURS, default 5h
--                        session window) or 'global' (AI_GLOBAL_WINDOW_HOURS,
--                        default 24h). Rows carry window_start/window_end, so
--                        windows roll over on their own. Written after every
--                        model step (main agent and delegates), read at
--                        admission by lib/ai/usage-store.ts.
--   limit_resets         audit log of manual resets (who/what/when).
--
-- APPLY TO BOTH DATABASES (see memory planner-migrations-two-databases):
--   production  scripts/migrate.ts (targets DATABASE_URL = prod)
--   staging     Neon branch br-damp-king-aduh8dec; the GRANT below runs only
--               where the staging_app role exists.
-- The code fails CLOSED if these tables are missing: /api/chat returns 503 and
-- every rate-limited route returns 429 until this migration is applied.

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expires
  ON rate_limit_counters (expires_at);

CREATE TABLE IF NOT EXISTS ai_token_usage (
  scope        TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  tokens       BIGINT      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, window_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_window_end
  ON ai_token_usage (window_end);

-- Audit log of every manual limit reset (reset_ai_limits MCP tool and
-- POST /api/admin/ai-limits/reset). Never updated or deleted by the app.
CREATE TABLE IF NOT EXISTS limit_resets (
  id            BIGSERIAL   PRIMARY KEY,
  actor_user_id TEXT        NOT NULL,
  via           TEXT        NOT NULL,
  scope         TEXT        NOT NULL,
  identity      TEXT,
  kind          TEXT        NOT NULL,
  ai_rows       INTEGER     NOT NULL DEFAULT 0,
  rate_rows     INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_counters TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_token_usage TO staging_app;
    GRANT SELECT, INSERT ON limit_resets TO staging_app;
    GRANT USAGE, SELECT ON SEQUENCE limit_resets_id_seq TO staging_app;
  END IF;
END $$;
