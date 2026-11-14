-- Migration 069: what the owner wants to be told about on their phone
--
-- WHY
-- Agents put questions in the owner's inbox and changes in front of them to
-- judge, and then wait. The owner only finds out by opening the planner. Phone
-- notifications existed in code (a subscribe route, a service worker, a sender)
-- but nothing ever sent one and there was nowhere to say what to be told about.
--
-- WHAT THIS DOES (additive only: one new table)
--   notification_prefs   one row per user: which kinds of thing to send to
--                        their devices (lib/notify/notify-model.ts). No row
--                        means the defaults.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON notification_prefs TO staging_app;
  END IF;
END $$;
