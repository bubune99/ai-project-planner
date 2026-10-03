-- Migration 059: make project_steps canonical; fold the work-order layer into it
--
-- WHY
-- work_order_steps (044) rebuilt storage project_steps already had. Every
-- primitive it needed existed earlier:
--
--   dispatchable instructions -> project_steps.step_instructions   (035)
--   an agent claiming a step  -> agents.current_task_id            (009)
--   prior art on a blocker    -> attempted_solutions (generic)     (042)
--   the event timeline        -> execution_history.step_id         (004/051/053)
--   downstream unlock         -> step_dependencies + unlock tables (034)
--
-- Five of the eight work_order_check_ins event types already exist in
-- execution_history, where triggers write them automatically. The result was two
-- tabs ("Tasks" and "Work") answering "what work exists" from different tables,
-- which is why nobody could remember what the Work tab was for. Usage on
-- 2026-10-03: 477 project_steps vs 23 work_order_steps, the latter untouched
-- since 2026-07-03.
--
-- WHAT THIS DOES
-- Keeps the parts of the work-order design that are genuinely better than
-- project_steps (below), moves them ONTO project_steps, and turns
-- work_order_steps into a pointer. work_orders survives as what it is actually
-- good at: a named, APPROVABLE grouping with a protocol.
--
-- NOTHING IS DROPPED. The duplicated columns on work_order_steps are marked
-- deprecated, not removed, because app/mcp/route.ts still reads them. Dropping
-- them is a separate change, after the tools are repointed, and per
-- .claude/CLAUDE.md requires Truth Seeker validation first.

BEGIN;

-- ── 1. The good details, merged onto project_steps ──────────────────────────
-- These are the things work_order_steps modelled that project_steps genuinely
-- lacked. This is the whole point of the merge.

-- Not every step is a unit of work. Some are gates you cannot pass, some are
-- verifications, some are protocol checks. project_steps had no way to say so.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS step_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE project_steps DROP CONSTRAINT IF EXISTS project_steps_step_type_check;
ALTER TABLE project_steps ADD CONSTRAINT project_steps_step_type_check
  CHECK (step_type IN ('task', 'checkpoint', 'gate', 'protocol_check', 'verification'));

-- DAG shape. step_dependencies says WHAT blocks what; these say how deep a step
-- sits and which steps may run concurrently — the output of a topo-sort.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS parallel_group INTEGER;

-- Capability matching. provides/requires let composition wire steps together by
-- what they yield rather than by hardcoded ids; required_capabilities is how a
-- step is matched to an agent that can actually do it.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS provides TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS requires TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS required_capabilities TEXT[] NOT NULL DEFAULT '{}';

-- Expected vs actual output. project_steps had acceptance_criteria (008) but no
-- way to state what artifacts a step should produce, nor record what it did.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS expected_artifacts TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS outcome_artifacts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS outcome_summary TEXT;

-- Failure and retry as data, not folded into status.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Where the step came from in the skills library.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS source_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS source_skill_version INTEGER;

-- [{ kind, id, label, url }] — the docs/links an agent needs at the moment it
-- works the step.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS step_references JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Claim + check-in bookkeeping. agents.current_task_id (009) records WHO is on a
-- step but not when they took it, whether a non-agent took it, or whether they
-- have been heard from since.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS claimed_by_type TEXT;
ALTER TABLE project_steps DROP CONSTRAINT IF EXISTS project_steps_claimed_by_type_check;
ALTER TABLE project_steps ADD CONSTRAINT project_steps_claimed_by_type_check
  CHECK (claimed_by_type IN ('user', 'agent', 'system') OR claimed_by_type IS NULL);
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS claimed_by_id TEXT;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMP;
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS check_in_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_project_steps_step_type ON project_steps(step_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_steps_claimed ON project_steps(claimed_by_id) WHERE claimed_by_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_steps_capabilities ON project_steps USING GIN (required_capabilities);

COMMENT ON COLUMN project_steps.step_type IS 'task | checkpoint | gate | protocol_check | verification. Merged from work_order_steps (059).';
COMMENT ON COLUMN project_steps.provides IS 'Capability tags this step yields, matched against later steps requires[]. Merged from work_order_steps (059).';
COMMENT ON COLUMN project_steps.parallel_group IS 'Steps sharing a parallel_group may run concurrently. Merged from work_order_steps (059).';

-- ── 2. work_order_steps becomes a pointer, not a store ──────────────────────
ALTER TABLE work_order_steps ADD COLUMN IF NOT EXISTS step_id UUID REFERENCES project_steps(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_order_steps_step ON work_order_steps(step_id) WHERE step_id IS NOT NULL;

COMMENT ON TABLE work_order_steps IS
  'Ordering/DAG membership of project_steps within a work order. Since 059 the WORK lives in project_steps (via step_id); the title/description/status/instructions/claim columns here are DEPRECATED duplicates kept only until app/mcp/route.ts is repointed. Do not write them in new code.';
COMMENT ON COLUMN work_order_steps.step_id IS 'The project_step this work-order step IS. Canonical since 059.';

-- ── 3. Promote the 23 existing work_order_steps into real steps ─────────────
-- Carries every field across, including the ones merged in section 1, so no
-- information is lost by making project_steps canonical.
WITH promoted AS (
  INSERT INTO project_steps (
    project_id, title, description, status, progress,
    phase, stage, estimated_hours, actual_hours, order_index,
    step_type, level, parallel_group,
    provides, requires, required_capabilities,
    expected_artifacts, outcome_artifacts, outcome_summary,
    retry_count, blocked_reason,
    source_skill_id, source_skill_version, step_references,
    claimed_by_type, claimed_by_id, claimed_at, last_check_in_at, check_in_count,
    acceptance_criteria, step_instructions, tags, metadata,
    created_at, updated_at, completed_at
  )
  SELECT
    wo.project_id,
    wos.title,
    COALESCE(NULLIF(wos.description, ''), wos.title),
    -- work-order vocabulary -> the step vocabulary the views understand
    CASE wos.status
      WHEN 'ready'       THEN 'pending'
      WHEN 'claimed'     THEN 'in-progress'
      WHEN 'in_progress' THEN 'in-progress'
      WHEN 'skipped'     THEN 'completed'
      ELSE wos.status
    END,
    CASE WHEN wos.status = 'completed' THEN 100
         WHEN wos.status IN ('claimed', 'in_progress') THEN 50
         ELSE 0 END,
    COALESCE(NULLIF(p.current_phase, ''), 'planning'),
    'work-order',
    0, 0,
    wos.step_order * 10,
    wos.step_type, wos.level, wos.parallel_group,
    wos.provides, wos.requires, wos.required_capabilities,
    wos.expected_artifacts, wos.outcome_artifacts, wos.outcome_summary,
    wos.retry_count, wos.blocked_reason,
    wos.source_skill_id, wos.source_skill_version, wos.step_references,
    wos.claimed_by_type, wos.claimed_by_id, wos.claimed_at, wos.last_check_in_at, wos.check_in_count,
    to_jsonb(wos.acceptance_criteria),
    -- step_instructions is JSONB NOT NULL DEFAULT '{}' (035) with an
    -- is-an-object CHECK, so an absent instruction must be '{}', never NULL.
    CASE WHEN NULLIF(wos.instructions, '') IS NULL THEN '{}'::jsonb
         ELSE jsonb_build_object('summary', wos.instructions) END,
    ARRAY['from-work-order'],
    jsonb_build_object('imported_from', 'work_order_steps', 'migration', '059',
                       'work_order_id', wos.work_order_id, 'work_order_step_id', wos.id),
    wos.created_at, NOW(),
    wos.completed_at
  FROM work_order_steps wos
  JOIN work_orders wo ON wo.id = wos.work_order_id
  JOIN projects p ON p.id = wo.project_id
  WHERE wos.step_id IS NULL
  RETURNING id, (metadata->>'work_order_step_id')::uuid AS src
)
UPDATE work_order_steps w
   SET step_id = pr.id, updated_at = NOW()
  FROM promoted pr
 WHERE w.id = pr.src;

-- ── 4. One timeline, not two ────────────────────────────────────────────────
-- execution_history already carries step_started / progress_note_added /
-- blocker_identified / step_completed and writes itself from triggers. Three
-- check-in event types had no equivalent; add them rather than keep a second
-- timeline table alive for their sake.
ALTER TABLE execution_history DROP CONSTRAINT IF EXISTS execution_history_event_type_check;
ALTER TABLE execution_history ADD CONSTRAINT execution_history_event_type_check
  CHECK (event_type IN (
    'ai_agent_action', 'blocker_identified', 'comment_added',
    'document_created', 'document_deleted', 'document_updated', 'document_uploaded',
    'phase_transition', 'progress_note_added', 'project_created', 'project_updated',
    'status_changed', 'step_completed', 'step_created', 'step_deleted',
    'step_started', 'step_updated',
    -- merged from work_order_check_ins (059)
    'step_claimed', 'step_released', 'step_retried', 'protocol_violation', 'step_failed'
  ));

INSERT INTO execution_history (project_id, step_id, event_type, description, metadata, user_id, created_at)
SELECT
  wo.project_id,
  wos.step_id,
  CASE ci.event_type
    WHEN 'claim'              THEN 'step_claimed'
    WHEN 'progress'           THEN 'progress_note_added'
    WHEN 'blocker'            THEN 'blocker_identified'
    WHEN 'completion'         THEN 'step_completed'
    WHEN 'failure'            THEN 'step_failed'
    WHEN 'release'            THEN 'step_released'
    WHEN 'retry'              THEN 'step_retried'
    WHEN 'protocol_violation' THEN 'protocol_violation'
    ELSE 'ai_agent_action'
  END,
  COALESCE(NULLIF(ci.message, ''), 'work-order check-in: ' || ci.event_type),
  jsonb_build_object('imported_from', 'work_order_check_ins', 'migration', '059',
                     'check_in_id', ci.id, 'by_type', ci.by_type, 'by_id', ci.by_id,
                     'payload', ci.payload),
  ci.user_id,
  ci.created_at
FROM work_order_check_ins ci
JOIN work_order_steps wos ON wos.id = ci.step_id
JOIN work_orders wo ON wo.id = ci.work_order_id
WHERE wos.step_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM execution_history eh
    WHERE eh.metadata->>'check_in_id' = ci.id::text
  );

COMMIT;
