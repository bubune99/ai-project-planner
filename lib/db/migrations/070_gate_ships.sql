-- 070: what shipped, and which pages it touched.
--
-- Each time a change goes live, the agent that shipped it reports the commit and the pages it touched. A stored
-- picture of a page taken before such a ship is out of date and says so (lib/gates/fresh-model.ts). Additive only;
-- safe to run twice. Until it is applied, pictures say they cannot be confirmed current.
--
-- Rollback: DROP TABLE gate_ships;

CREATE TABLE IF NOT EXISTS gate_ships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env         text NOT NULL CHECK (env IN ('production', 'staging')),
  sha         text NOT NULL,
  routes      jsonb NOT NULL DEFAULT '[]'::jsonb,
  everywhere  boolean NOT NULL DEFAULT false,
  files       integer NOT NULL DEFAULT 0,
  note        text,
  created_by  text,
  shipped_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, env, sha)
);
CREATE INDEX IF NOT EXISTS idx_gate_ships_project ON gate_ships(project_id, shipped_at DESC);
