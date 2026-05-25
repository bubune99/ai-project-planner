-- Migration 041: 5W+H universal documentation envelope
-- Adds documentation_5wh JSONB column to every user-facing entity table in the planner.
-- See memory: planner-meta-roadmap-septet — locked design 2026-05-25.
--
-- Envelope shape (Zod-enforced at API layer; this column accepts any JSONB):
--   who:   { user_id*, agent_id?, role?, contributors?[] }
--   what:  { title*, type*, summary*, scope? }
--   when:  { created_at*, due_at?, occurred_at?, milestones?[], supersedes_at? }
--   where: { project_id*, parent_entity?, file_paths?[], routes?[], external_refs?[] }
--   why:   { rationale*, constraints?[], decision_ids?[], alternatives_considered?[], relates_to?[] }
--   how:   { approach?, instructions?, references?[], success_criteria?[], risks?[] }
--
-- Idempotent — safe to re-run. Uses ADD COLUMN IF NOT EXISTS (Postgres 9.6+).
-- GIN indexes on documentation_5wh per table for query performance.

BEGIN;

-- ============================================================================
-- Primary entity tables (28)
-- ============================================================================

ALTER TABLE projects                ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE project_steps           ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE todos                   ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ideas                   ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_branches           ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_facets             ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_validations        ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_refinements        ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_documents          ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_perspectives       ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_scenarios          ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE architecture_decisions  ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE project_phases          ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE progress_notes          ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE documents               ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sops                    ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_jobs              ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_accounts        ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_transactions    ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_budgets         ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_income_streams  ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE finance_goals           ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calendar_events         ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE calendar_categories     ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE clients                 ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE service_schedules       ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE feedback                ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sources                 ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- Secondary entity tables (5)
-- ============================================================================

ALTER TABLE feature_requests        ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_notes              ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_relationships      ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_transformations    ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE idea_canvas_snapshots   ADD COLUMN IF NOT EXISTS documentation_5wh JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- GIN indexes for query performance on envelope
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_5wh                ON projects                USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_project_steps_5wh           ON project_steps           USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_todos_5wh                   ON todos                   USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_ideas_5wh                   ON ideas                   USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_idea_facets_5wh             ON idea_facets             USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_architecture_decisions_5wh  ON architecture_decisions  USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_progress_notes_5wh          ON progress_notes          USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_sops_5wh                    ON sops                    USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_5wh              ON agent_jobs              USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_calendar_events_5wh         ON calendar_events         USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_clients_5wh                 ON clients                 USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_service_schedules_5wh       ON service_schedules       USING GIN (documentation_5wh);
CREATE INDEX IF NOT EXISTS idx_feedback_5wh                ON feedback                USING GIN (documentation_5wh);

COMMENT ON COLUMN ideas.documentation_5wh IS '5W+H universal envelope. Zod-validated at API layer. Mandatory: who.user_id, what.title/type/summary, when.created_at, where.project_id, why.rationale.';

COMMIT;
