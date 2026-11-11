-- Migration 062: flow verification runs and frames (flow-first planning, part 2)
--
-- WHY
-- Flow contract v0.1 (planner doc d56f1a28): each flow step can carry frames
-- (words, wireframe, mock-up, screenshot), and a verification walk checks every
-- button against the step's expected transitions. Part 1 (lib/mcp/flow-tools.ts)
-- only appended a one-line run record to the flow document. This stores runs
-- and frames properly so the storyboard view can show the best frame per step
-- and the owner's retention rule can delete what is no longer needed.
--
-- WHAT THIS DOES (additive only: two new tables, nothing altered or dropped)
--   flow_runs    one row per verification walk: flow id + version, env, build,
--                pass/total and the per-button results (jsonb).
--   flow_frames  one row per frame: step id, kind, env/build, the R2 key (or an
--                external url for mock-ups), passed / open finding / resolved
--                at / pinned, captured_at. Soft-deleted by the retention sweep
--                (deleted_at) after its R2 object is removed.
--
-- RETENTION (owner, 2026-11-11; lib/flows/flow-model.ts framesToExpire)
--   keep the latest passing screenshot per step per env, failures until the
--   finding is resolved + 14 days, pinned ("training") frames, and non-screenshot
--   frames; every other screenshot expires after 30 days.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST (memory planner-migrations-two-databases):
--   staging     Neon branch br-damp-king-aduh8dec (GRANT below runs only there)
--   production  scripts/migrate.ts (DATABASE_URL = prod), after a backup branch.
-- Nothing reads these tables until the part-2 code ships, so applying early is safe.

CREATE TABLE IF NOT EXISTS flow_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  flow_id       text NOT NULL,
  flow_version  integer NOT NULL,
  env           text NOT NULL CHECK (env IN ('staging', 'prod')),
  build         text NOT NULL,
  passed        integer NOT NULL DEFAULT 0,
  total         integer NOT NULL DEFAULT 0,
  results       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_runs_document ON flow_runs(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS flow_frames (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id          uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  flow_id              text NOT NULL,
  flow_version         integer NOT NULL,
  step                 text NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('words', 'wireframe', 'mockup', 'screenshot')),
  env                  text CHECK (env IN ('staging', 'prod')),
  build                text,
  run_id               uuid REFERENCES flow_runs(id) ON DELETE SET NULL,
  blob_key             text,
  url                  text,
  caption              text,
  passed               boolean,
  open_finding         boolean NOT NULL DEFAULT false,
  finding_resolved_at  timestamptz,
  pinned               boolean NOT NULL DEFAULT false,
  byte_size            integer,
  captured_at          timestamptz NOT NULL DEFAULT now(),
  created_by           text,
  deleted_at           timestamptz,
  CHECK (blob_key IS NOT NULL OR url IS NOT NULL OR kind = 'words')
);
CREATE INDEX IF NOT EXISTS idx_flow_frames_step ON flow_frames(document_id, step) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flow_frames_sweep ON flow_frames(kind, captured_at) WHERE deleted_at IS NULL AND pinned = false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON flow_runs TO staging_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON flow_frames TO staging_app;
  END IF;
END $$;
