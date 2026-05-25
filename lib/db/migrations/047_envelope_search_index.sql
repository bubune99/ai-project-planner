-- Migration 047: Materialized envelope index view (Phase 11 / G L3)
-- Cross-entity full-text search over all 5W+H envelopes.
-- Each row represents one documentable entity with searchable fields extracted.
--
-- Refresh policy: REFRESH MATERIALIZED VIEW CONCURRENTLY envelope_search_index
-- (a daily cron or on-demand from MCP tool `audit_5wh` with scope='refresh')
--
-- See memory: planner-meta-roadmap-septet — Idea G Layer 3.
-- Idempotent.

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS envelope_search_index;

CREATE MATERIALIZED VIEW envelope_search_index AS
WITH all_entities AS (
  -- Core project entities
  SELECT 'project'::text AS entity_type, id AS entity_id, user_id, NULL::uuid AS project_id,
         name AS title, description AS summary, documentation_5wh, created_at, updated_at,
         deleted_at
    FROM projects
  UNION ALL
  SELECT 'project_step', id, NULL::uuid, project_id, title, description,
         documentation_5wh, created_at, updated_at, deleted_at
    FROM project_steps
  UNION ALL
  SELECT 'todo', id, user_id, project_id, title, description, documentation_5wh,
         created_at, updated_at, deleted_at
    FROM todos
  UNION ALL
  -- Ideas family
  SELECT 'idea', id, user_id, NULL::uuid, title, description, documentation_5wh,
         created_at, updated_at, deleted_at
    FROM ideas
  UNION ALL
  SELECT 'idea_facet', id, NULL::uuid, NULL::uuid, name, data::text,
         documentation_5wh, created_at, updated_at, NULL::timestamptz
    FROM idea_facets
  UNION ALL
  SELECT 'idea_refinement', id, NULL::uuid, source_project_id, title, description,
         documentation_5wh, created_at, updated_at, NULL::timestamptz
    FROM idea_refinements
  UNION ALL
  SELECT 'idea_document', id, NULL::uuid, NULL::uuid, title,
         LEFT(COALESCE(content, ''), 500), documentation_5wh,
         created_at, updated_at, NULL::timestamptz
    FROM idea_documents
  UNION ALL
  -- Decisions + execution
  SELECT 'architecture_decision', id, NULL::uuid, project_id, title,
         decision || ' | ' || COALESCE(context, ''),
         documentation_5wh, created_at, updated_at, NULL::timestamptz
    FROM architecture_decisions
  UNION ALL
  SELECT 'progress_note', id, user_id, project_id, COALESCE(author_name, 'note'),
         LEFT(content, 500), documentation_5wh, created_at, NULL::timestamptz, NULL::timestamptz
    FROM progress_notes
  UNION ALL
  -- Documentation
  SELECT 'document', id, NULL::uuid, project_id, title, LEFT(COALESCE(content, ''), 500),
         documentation_5wh, created_at, updated_at, NULL::timestamptz
    FROM documents
  UNION ALL
  SELECT 'sop', id, user_id, project_id, title, LEFT(content, 500),
         documentation_5wh, created_at, updated_at, deleted_at
    FROM sops
  UNION ALL
  -- Agent jobs
  SELECT 'agent_job', id, NULL::uuid, NULL::uuid, COALESCE(title, 'job'),
         LEFT(COALESCE(description, ''), 500), documentation_5wh,
         created_at, updated_at, NULL::timestamptz
    FROM agent_jobs
  UNION ALL
  -- Clients + service
  SELECT 'client', id, user_id, NULL::uuid, name, COALESCE(notes, ''), documentation_5wh,
         created_at, updated_at, deleted_at
    FROM clients
  UNION ALL
  SELECT 'service_schedule', id, user_id, NULL::uuid, title, description,
         documentation_5wh, created_at, updated_at, deleted_at
    FROM service_schedules
  UNION ALL
  -- Feedback
  SELECT 'feedback', id, NULL::uuid, project_id, COALESCE(title, 'feedback'),
         LEFT(COALESCE(comment, ''), 500), documentation_5wh,
         created_at, updated_at, NULL::timestamptz
    FROM feedback
  UNION ALL
  -- Library
  SELECT 'skill', id, user_id, project_id, title, description, documentation_5wh,
         created_at, updated_at, deleted_at
    FROM skills
  UNION ALL
  SELECT 'feature_template', id, user_id, project_id, title, description,
         documentation_5wh, created_at, updated_at, deleted_at
    FROM feature_templates
  UNION ALL
  SELECT 'protocol', id, user_id, project_id, title, description,
         documentation_5wh, created_at, updated_at, deleted_at
    FROM protocols
  UNION ALL
  -- Work orders
  SELECT 'work_order', id, user_id, project_id, title, description,
         documentation_5wh, created_at, updated_at, deleted_at
    FROM work_orders
  UNION ALL
  SELECT 'work_order_step', id, NULL::uuid, NULL::uuid, title, description,
         documentation_5wh, created_at, updated_at, NULL::timestamptz
    FROM work_order_steps
  UNION ALL
  -- Prompts
  SELECT 'prompt', id, user_id, project_id, name, purpose, documentation_5wh,
         created_at, updated_at, deleted_at
    FROM prompts
)
SELECT
  ae.entity_type,
  ae.entity_id,
  ae.user_id,
  ae.project_id,
  ae.title,
  ae.summary,
  ae.documentation_5wh,
  -- Extracted searchable fields from envelope
  ae.documentation_5wh->'who'->>'user_id' AS env_who_user_id,
  ae.documentation_5wh->'what'->>'title' AS env_what_title,
  ae.documentation_5wh->'what'->>'type' AS env_what_type,
  ae.documentation_5wh->'what'->>'summary' AS env_what_summary,
  ae.documentation_5wh->'why'->>'rationale' AS env_why_rationale,
  -- Completeness score: 50 (starred) + 50 * (filled / 20 optional)
  CASE WHEN ae.documentation_5wh = '{}'::jsonb THEN 0 ELSE 50 END AS envelope_completeness_base,
  -- Searchable tsvector — title + summary + rationale, language: english
  to_tsvector(
    'english',
    COALESCE(ae.title, '') || ' ' ||
    COALESCE(ae.summary, '') || ' ' ||
    COALESCE(ae.documentation_5wh->'why'->>'rationale', '')
  ) AS search_vector,
  ae.created_at,
  ae.updated_at
FROM all_entities ae
WHERE ae.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envelope_search_pk
  ON envelope_search_index (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_envelope_search_user
  ON envelope_search_index (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_envelope_search_project
  ON envelope_search_index (project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_envelope_search_type
  ON envelope_search_index (entity_type);

CREATE INDEX IF NOT EXISTS idx_envelope_search_vector
  ON envelope_search_index USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_envelope_search_updated
  ON envelope_search_index (updated_at DESC);

COMMENT ON MATERIALIZED VIEW envelope_search_index IS
'Cross-entity full-text search over 5W+H envelopes. ~21 entity types unioned. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY envelope_search_index. Powers cross-system "find anything by who/what/why" queries (Phase 11 / G L3).';

COMMIT;
