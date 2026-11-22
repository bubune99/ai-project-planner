-- Migration 086: the owner's account preferences (timezone, default model)
--
-- WHY
-- Settings showed "Not built yet" for the timezone and the assistant's default
-- model (card c3dbdd34). Nothing in the database held a per-account preference:
-- notification_prefs holds only which notices to send, and its save replaces
-- the whole value, so it is not a place to keep anything else.
--
-- WHAT THIS DOES (additive only: one new table, safe to run twice)
--   user_settings   one row per user. No row, or a NULL column, means "not
--                   chosen": this device's timezone, the planner's default
--                   model. Values are checked by lib/settings/preferences.ts
--                   before they are written and again when they are read, so a
--                   zone or model that is later retired reads as not chosen.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone      text,
  default_model text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO staging_app;
  END IF;
END $$;
