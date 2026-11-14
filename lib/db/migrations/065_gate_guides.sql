-- Migration 065: guides, the stack entries and taste statements that become checks
--
-- WHY
-- Owner 2026-11-13: the stack we build with (Next.js, Vercel, Cloudflare,
-- Stripe, Hexclave, React Flow, shadcn/ui, Radix, Zustand) and written
-- preferences on how things should be built and look are held in the planner,
-- where they can be read and adjusted, and turned into checks that the plugin
-- applies to each file as it is written. Rules: lib/gates/guides.ts.
--
-- WHAT THIS DOES (additive only: one new table)
--   gate_guides  one row per stack entry or statement, belonging to a person
--                and applying to all their projects (project_id null) or one.
--
-- APPLY TO BOTH DATABASES, STAGING FIRST.

CREATE TABLE IF NOT EXISTS gate_guides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('stack', 'statement')),
  name        text NOT NULL,
  summary     text NOT NULL,
  skill       text,
  applies     jsonb NOT NULL,
  checks      jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  source      text NOT NULL CHECK (source IN ('owner', 'research', 'agent')),
  basis       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_guides_name ON gate_guides(user_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staging_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON gate_guides TO staging_app;
  END IF;
END $$;
