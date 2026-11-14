-- Migration 063: page checklists ("Checks"), their verdicts and their pictures
--
-- WHY
-- Owner 2026-11-13: the planner becomes the source of truth for what an agent
-- must verify before it may call a screen done. One checklist per page; a page
-- has views (the page, and every menu, dialog or panel that opens from it); a
-- view has controls; a control has workflows, each checked once per state.
-- The rules are pure functions in lib/gates/gate-model.ts.
--
-- WHAT THIS DOES (additive only: three new tables, nothing altered or dropped)
--   gate_checklists  one row per version of a page's checklist (doc jsonb).
--   gate_results     one row per verdict on one check: a claim by the scan
--                    (to be validated), or a verdict by builder, reviewer or
--                    owner. Never updated: the latest per actor is what counts.
--   gate_images      one row per stored file: a view's picture, a view's
--                    extract (its styled HTML, gzipped, which the planner
--                    draws instead of a picture), or evidence for a check. Soft-deleted by the retention sweep after its
--                    R2 object is removed.
--
-- RETENTION (owner 2026-11-13; gate-model.ts imagesToExpire)
--   view pictures for the current version and the one before it; the newest
--   evidence picture per check for 3 days, or for as long as that check is
--   failed or disputed. Everything else is deleted.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST (memory planner-migrations-two-databases).

CREATE TABLE IF NOT EXISTS gate_checklists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route       text NOT NULL,
  version     integer NOT NULL,
  title       text,
  env         text CHECK (env IN ('staging', 'prod', 'local')),
  build       text,
  doc         jsonb NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, route, version)
);

CREATE TABLE IF NOT EXISTS gate_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL REFERENCES gate_checklists(id) ON DELETE CASCADE,
  check_key     text NOT NULL,
  actor         text NOT NULL CHECK (actor IN ('scan', 'builder', 'reviewer', 'owner')),
  status        text NOT NULL CHECK (status IN ('passed', 'failed', 'waived')),
  note          text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'waived' OR actor = 'owner')
);
CREATE INDEX IF NOT EXISTS idx_gate_results_checklist ON gate_results(checklist_id, check_key, created_at DESC);

CREATE TABLE IF NOT EXISTS gate_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_id  uuid NOT NULL REFERENCES gate_checklists(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('view', 'extract', 'evidence')),
  ref_key       text NOT NULL,
  blob_key      text NOT NULL,
  byte_size     integer,
  created_by    text,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gate_images_checklist ON gate_images(checklist_id, kind, ref_key, captured_at DESC) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_checklists TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_results TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_images TO staging_app;
  END IF;
END $$;
