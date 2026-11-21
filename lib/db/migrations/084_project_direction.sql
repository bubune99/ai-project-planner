-- 084: Direction, per project (card 2da4639c). Which decisions an agent takes alone and which wait for the owner,
-- his direction for each kind, and the build decisions the AI proposed or took. One document per project, saved
-- whole with its version (like people_flows), and a record of every change.

CREATE TABLE IF NOT EXISTS project_direction (
  project_id  uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  doc         jsonb NOT NULL DEFAULT '{}'::jsonb,
  version     integer NOT NULL DEFAULT 1,
  updated_by  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_direction_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('owner', 'agent')),
  created_by  text NOT NULL,
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_direction_changes_project ON project_direction_changes (project_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_direction TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_direction_changes TO staging_app;
  END IF;
END $$;
