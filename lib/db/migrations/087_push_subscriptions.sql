-- 086: push_subscriptions, written down (card fef347d2). The table is already on the staging and the production
-- database (made by hand; no earlier migration creates it), so this changes nothing there. It is here so a fresh
-- database gets the table that app/api/push/subscribe, app/api/push/prefs, app/api/settings/export and
-- lib/push/send.ts read and write. Safe to run twice.
--
-- Known from the live table: the eight column names. Known from the code: endpoint is unique (subscribe saves with
-- ON CONFLICT (endpoint)); user_id holds users.id; deleted_at is the "turned off" mark and is set back to NULL when
-- the device is saved again; created_at is never written by the code, so it has a default.
-- INFERRED, not read from the live table: every column type, the id default, NOT NULL on the five written columns,
-- the foreign key to users with ON DELETE CASCADE, the updated_at default, and the index on user_id.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),                 -- inferred
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,       -- type, NOT NULL and the key inferred
  endpoint    text NOT NULL UNIQUE,                                       -- unique is required by ON CONFLICT (endpoint); the route allows up to 2000 characters
  p256dh      text NOT NULL,                                              -- type inferred; the route allows up to 300 characters
  auth        text NOT NULL,                                              -- type inferred; the route allows up to 300 characters
  created_at  timestamptz NOT NULL DEFAULT now(),                         -- the default is required: no code writes it
  updated_at  timestamptz NOT NULL DEFAULT now(),                         -- default inferred; the route sets it on a second save
  deleted_at  timestamptz                                                 -- NULL while notifications are on for the device
);

-- Inferred: the sender and the settings page read one person's live devices.
CREATE INDEX IF NOT EXISTS push_subscriptions_user_live ON push_subscriptions (user_id) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO staging_app;
  END IF;
END $$;
