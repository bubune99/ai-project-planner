-- 090: leads (card 1711d9e8). A note someone left on one of the owner's sites, kept in the planner so it can be
-- followed up from one place. Owner, 2026-11-25 (question cea936a9): "Yes: save each note as a lead in the planner,
-- and keep the email." Written by POST /api/projects/[id]/leads (a key with the leads:write scope, or the owner);
-- read and marked by the owner. Rules: lib/leads/lead-model.ts. New table only: nothing existing changes. Safe to run
-- twice.

CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source      text NOT NULL,                       -- "farcncpt.com contact form"
  ref         text,                                -- the site's own id for the note: a retried send is saved once
  name        text NOT NULL,
  email       text NOT NULL,
  company     text,
  topic       text,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'closed')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,   -- the key's (or the owner's) user
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_project_ref ON leads (project_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_project_recent ON leads (project_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO staging_app;
  END IF;
END $$;
