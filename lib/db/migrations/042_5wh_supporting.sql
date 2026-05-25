-- Migration 042: 5W+H supporting structures
-- Three patterns ported from Memory-Agent's design (not its implementation):
--   1. Hierarchical decisions  — parent_decision_id + materialized path on architecture_decisions
--   2. Attempted solutions     — first-class table for failed/abandoned approaches with lessons_learned
--   3. Entity relations        — single polymorphic cross-link table with typed relation_type
--
-- See memory: planner-meta-roadmap-septet — locked design 2026-05-25.
-- Idempotent — safe to re-run.

BEGIN;

-- ============================================================================
-- 1. Hierarchical decisions on architecture_decisions
-- ============================================================================
-- Existing table has supersedes_adr_id ↔ superseded_by_adr_id (lateral supersession).
-- Adding parent_decision_id + path enables vertical reasoning trees:
-- "this decision is a child of that broader decision"

ALTER TABLE architecture_decisions
  ADD COLUMN IF NOT EXISTS parent_decision_id UUID REFERENCES architecture_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_path TEXT,
  ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_architecture_decisions_parent       ON architecture_decisions (parent_decision_id);
CREATE INDEX IF NOT EXISTS idx_architecture_decisions_path         ON architecture_decisions (decision_path varchar_pattern_ops);

-- Backfill decision_path for existing rows (each becomes a root: path = own id)
UPDATE architecture_decisions
   SET decision_path = id::text
 WHERE decision_path IS NULL;

-- Trigger function: maintain decision_path + depth on insert/update
CREATE OR REPLACE FUNCTION fn_architecture_decisions_maintain_path() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_decision_id IS NULL THEN
    NEW.decision_path := NEW.id::text;
    NEW.depth := 0;
  ELSE
    SELECT decision_path || '.' || NEW.id::text, depth + 1
      INTO NEW.decision_path, NEW.depth
      FROM architecture_decisions
     WHERE id = NEW.parent_decision_id;
    IF NEW.decision_path IS NULL THEN
      NEW.decision_path := NEW.id::text;
      NEW.depth := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_architecture_decisions_path ON architecture_decisions;
CREATE TRIGGER trg_architecture_decisions_path
  BEFORE INSERT OR UPDATE OF parent_decision_id ON architecture_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_architecture_decisions_maintain_path();

COMMENT ON COLUMN architecture_decisions.parent_decision_id IS 'Parent decision in hierarchical reasoning tree. NULL = root decision.';
COMMENT ON COLUMN architecture_decisions.decision_path IS 'Materialized path of UUIDs joined by ".". Enables tree-prefix queries.';
COMMENT ON COLUMN architecture_decisions.depth IS 'Distance from root. 0 = root. Maintained by trigger.';

-- ============================================================================
-- 2. attempted_solutions — first-class failure capture
-- ============================================================================
-- Distinct from migration 027's mlp_why_attempts (which is code-knowledge layer).
-- This is entity-scoped: any entity (idea, todo, step, work_order_step, etc.) can have
-- one or more attempted approaches that failed, were abandoned, or were superseded.

CREATE TABLE IF NOT EXISTS attempted_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic entity reference (no FK — discriminator + UUID pattern)
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- The attempt itself
  approach TEXT NOT NULL,                    -- what was tried (one-line summary)
  approach_detail TEXT,                      -- full description / steps taken
  outcome TEXT NOT NULL CHECK (outcome IN ('failed', 'abandoned', 'superseded', 'inconclusive')),
  failure_mode TEXT,                         -- how it failed (timeout, wrong-output, crash, etc.)
  root_cause TEXT,                           -- diagnosed reason
  lessons_learned TEXT NOT NULL,             -- what we now know (mandatory — no point recording attempts without learnings)
  prevention_strategy TEXT,                  -- how to avoid in future

  -- Replacement reference (if outcome = 'superseded')
  superseded_by_entity_type TEXT,
  superseded_by_entity_id UUID,

  -- Ownership + audit
  user_id UUID NOT NULL,
  project_id UUID,                           -- nullable: cross-project lessons possible
  attempted_by_type TEXT NOT NULL DEFAULT 'user' CHECK (attempted_by_type IN ('user', 'agent', 'system')),
  attempted_by_id TEXT,                      -- agent name / system component
  tried_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- 5W+H envelope (born with it)
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_attempted_solutions_entity      ON attempted_solutions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_user        ON attempted_solutions (user_id);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_project     ON attempted_solutions (project_id);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_outcome     ON attempted_solutions (outcome);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_tried_at    ON attempted_solutions (tried_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_5wh         ON attempted_solutions USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_attempted_solutions_active      ON attempted_solutions (entity_type, entity_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE attempted_solutions IS 'Failed/abandoned/superseded approaches per entity. Feeds D failure-recovery prior-art lookup and E prompt evolution. Distinct from mlp_why_attempts (code-knowledge layer).';

-- ============================================================================
-- 3. entity_relations — single polymorphic cross-link table
-- ============================================================================
-- Powers Gap #3 visualization (knowledge graph) and F2 cross-link UI.
-- why.relates_to[] in envelope is the lightweight inline version; this is the queryable graph version.

CREATE TABLE IF NOT EXISTS entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic from-side
  from_entity_type TEXT NOT NULL,
  from_entity_id UUID NOT NULL,

  -- Polymorphic to-side
  to_entity_type TEXT NOT NULL,
  to_entity_id UUID NOT NULL,

  -- Typed relation
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'supersedes',         -- this replaces that
    'derives_from',       -- this was created from that
    'related_to',         -- generic association
    'conflicts_with',     -- this and that cannot coexist
    'implements',         -- this is an implementation of that (e.g. work_order implements feature_template)
    'blocks',             -- this prevents that from proceeding
    'part_of',            -- this is a component of that
    'references',         -- this cites that
    'promoted_from',      -- this was promoted from that (idea→template→work_order chain)
    'addresses',          -- this addresses that (e.g. work_order addresses feedback)
    'inspired_by'         -- soft link; "this influenced that"
  )),

  -- Optional confidence (0.00–1.00) — useful for auto-suggested links
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),

  -- Direction note: most relations are directional (from → to)
  -- 'related_to' and 'conflicts_with' are symmetric; we still store one row per pair (querier handles)

  -- Ownership + audit
  user_id UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent', 'system', 'inferred')),
  created_by_id TEXT,                        -- agent name / system component
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- 5W+H envelope + metadata (born with it)
  documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Prevent exact duplicates (same from/to/type by same user)
  CONSTRAINT entity_relations_unique_active UNIQUE (from_entity_type, from_entity_id, to_entity_type, to_entity_id, relation_type, user_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_relations_from       ON entity_relations (from_entity_type, from_entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_relations_to         ON entity_relations (to_entity_type, to_entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_relations_type       ON entity_relations (relation_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_relations_user       ON entity_relations (user_id);
CREATE INDEX IF NOT EXISTS idx_entity_relations_created    ON entity_relations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_relations_5wh        ON entity_relations USING GIN (documentation_5wh);

COMMENT ON TABLE entity_relations IS 'Polymorphic cross-link graph across all planner entities. Powers Gap #3 visualization and F2 cross-link UI. Typed via relation_type. why.relates_to[] in envelope is the lightweight inline version.';

COMMIT;
