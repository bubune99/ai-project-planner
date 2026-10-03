-- Migration 056: Bridge todos and project_steps
--
-- WHY THIS EXISTS
-- The platform has two work-item stores and no relationship between them:
--
--   project_steps  (001) — the execution spine. 22 of the 55 migrations depend
--                          on it: dependencies, phases, subtasks (011),
--                          progress_notes anchoring (012), step_instructions
--                          (035), kanban statuses + comments + time entries
--                          (052), the 5W+H envelope (041), search (047).
--                          Rows on 2026-10-02: ZERO on every active project.
--
--   todos          (025) — a personal list with an OPTIONAL project link,
--                          later made cross-domain (030).
--                          Rows on 2026-10-02: 492, of which 129 completed.
--
-- Everything the project page reports on reads project_steps, and nothing
-- writes to it, so every project shows "Tasks done 0 / 0" and "Progress 0%".
-- The cause is the write path: create_todo takes a title; create_task requires
-- phase, stage, order_index and a NOT NULL description. Agents took the cheap
-- call 492 times. The product's own Ideas tab did the same — its
-- promoteToTask() POSTs to /api/todos.
--
-- THIS MIGRATION IS ADDITIVE AND MOVES NO DATA. It makes the backfill in 057
-- possible and correct. Run it first, on its own.

-- ── 1. Accept 'urgent' priority ─────────────────────────────────────────────
-- todos.priority allows ('low','medium','high','urgent'); project_steps.priority
-- allows ('low','medium','high', NULL) — see 008_task_enhancements.sql:15.
-- Without this, every urgent todo fails the backfill insert outright.
ALTER TABLE project_steps DROP CONSTRAINT IF EXISTS project_steps_priority_check;
ALTER TABLE project_steps
  ADD CONSTRAINT project_steps_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent') OR priority IS NULL);

COMMENT ON COLUMN project_steps.priority IS
  'Task priority. Matches todos.priority exactly so the two stores stay convertible.';

-- ── 2. Provenance, both directions ──────────────────────────────────────────
-- A promoted todo must stay traceable to the step it became, and a step must
-- say where it came from. Without this the backfill is unauditable and
-- un-re-runnable.
ALTER TABLE project_steps
  ADD COLUMN IF NOT EXISTS source_todo_id UUID REFERENCES todos(id) ON DELETE SET NULL;

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS step_id UUID REFERENCES project_steps(id) ON DELETE SET NULL;

-- One todo becomes at most one step. This is what makes 057 idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_steps_source_todo
  ON project_steps(source_todo_id) WHERE source_todo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todos_step_id
  ON todos(step_id) WHERE deleted_at IS NULL AND step_id IS NOT NULL;

COMMENT ON COLUMN project_steps.source_todo_id IS
  'The todo this step was promoted from (backfill 057, or the promote path). NULL for natively-created steps.';
COMMENT ON COLUMN todos.step_id IS
  'Set when this todo has been promoted to a project_step. A todo with step_id set is a pointer, not open work.';

-- ── 3. Status vocabulary ────────────────────────────────────────────────────
-- todos use 'in_progress'; project_steps use 'in-progress'. 052 dropped the
-- status CHECK on project_steps, so a mismatched value does NOT error — it
-- inserts, and step_status_kind() then classifies it 'open' instead of
-- 'active'. A silent wrong answer. This normalizer is the single place that
-- conversion happens, in both directions.
CREATE OR REPLACE FUNCTION todo_status_to_step_status(p_status TEXT)
RETURNS TEXT AS $$
  SELECT CASE p_status
    WHEN 'in_progress' THEN 'in-progress'
    WHEN 'completed'   THEN 'completed'
    WHEN 'pending'     THEN 'pending'
    ELSE 'pending'
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION step_status_to_todo_status(p_project_id UUID, p_status TEXT)
RETURNS TEXT AS $$
  -- Routed through step_status_kind so CUSTOM per-project statuses (052) map
  -- correctly, not just the six built-ins.
  SELECT CASE step_status_kind(p_project_id, p_status)
    WHEN 'done'   THEN 'completed'
    WHEN 'active' THEN 'in_progress'
    ELSE 'pending'
  END;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION todo_status_to_step_status IS
  'todos.status -> project_steps.status. The underscore/hyphen split is a real trap: 052 removed the CHECK, so a bad value inserts silently and reads back as the wrong kind.';

-- ── 4. Correct the EXISTING progress function (do NOT add a second one) ───
-- projects.progress IS already derived: update_project_progress() in
-- 003_functions.sql:5, fired by trigger_update_project_progress in
-- 004_triggers.sql:5-8. It reads 0% today only because it averages over zero
-- steps. Adding a second trigger here would have had two functions writing the
-- same column.
--
-- It does have two real gaps, fixed below by replacing the body in place so the
-- existing trigger keeps working:
--
--   a) It averages project_steps.progress ONLY. A step sitting at
--      status='completed' with progress=0 -- which is what every status-only
--      Kanban drag produces -- counts as 0%. A fully finished project could
--      read 0%.
--   b) It predates custom per-project statuses (052). A project whose "done"
--      column is keyed 'shipped' rather than 'completed' is invisible to it.
--      Routing through step_status_kind() fixes both built-in and custom keys.
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET
    progress = (
      SELECT COALESCE(ROUND(AVG(
        CASE WHEN step_status_kind(ps.project_id, ps.status) = 'done'
             THEN 100
             ELSE COALESCE(ps.progress, 0)
        END
      )), 0)
      FROM project_steps ps
      WHERE ps.project_id = v_project_id
        AND ps.deleted_at IS NULL
    ),
    updated_at = NOW()
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_project_progress() IS
  'Derives projects.progress from its steps. Counts any done-kind status (incl. custom 052 statuses) as 100, so a status-only completion is not scored 0.';

-- ── 5. Stop the blocker trigger logging a false event on every insert ───────
-- log_blocker_identification() (004, user_id fixed in 051) fires AFTER INSERT
-- on project_steps and writes execution_history from an AGGREGATE select with
-- no GROUP BY. An aggregate with no GROUP BY returns ONE ROW EVEN WHEN NOTHING
-- MATCHES -- so a brand-new step with zero dependencies logs:
--
--     'Step "X" is blocked by 0 incomplete dependencies'
--
-- with blocking_steps = NULL. Every step ever created has written a false
-- "blocker_identified" audit event. Nobody noticed because almost no steps
-- were ever created. The 057 backfill would write ~400 of them in one
-- transaction, so fix it here, before that runs.
--
-- HAVING COUNT(*) > 0 suppresses the row when there are no blocking
-- dependencies. Everything else is byte-identical to the 051 version.
CREATE OR REPLACE FUNCTION log_blocker_identification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM projects WHERE id = NEW.project_id;
  v_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000001');

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_blocked = false AND NEW.is_blocked = true) THEN
    INSERT INTO execution_history (
      project_id, step_id, event_type, description, metadata, user_id
    )
    SELECT
      NEW.project_id,
      NEW.id,
      'blocker_identified',
      'Step "' || NEW.title || '" is blocked by ' || COUNT(*) || ' incomplete dependencies',
      jsonb_build_object(
        'blocking_steps', jsonb_agg(jsonb_build_object(
          'step_id', ps.id,
          'title', ps.title,
          'status', ps.status
        ))
      ),
      v_user_id
    FROM step_dependencies sd
    JOIN project_steps ps ON sd.depends_on_step_id = ps.id
    WHERE sd.step_id = NEW.id
      AND ps.status != 'completed'
      AND sd.deleted_at IS NULL
      AND ps.deleted_at IS NULL
    HAVING COUNT(*) > 0;   -- <-- the fix
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_blocker_identification() IS
  'Logs when steps become blocked. HAVING COUNT(*) > 0 added 2026-10-02: without it every INSERT logged a false "blocked by 0 dependencies" event.';
