-- 071: one board for the owner and the agents.
--
-- Owner, 2026-11-16: "It feels like you and the agents have a separate task list that you abide by than the one that
-- I see in the UI and that is wrong. I should be able to see all the things that you have to do with clear
-- deliverables and action states ... a card for all of your maintenance and upkeep items and be able to drag things in
-- which should be able to kick you and any of the other agents off to start working ... If you need to do a production
-- migration, then do what you do".
--
-- A card says what kind of work it is. Where it stands is its status (the board's column): requested, pending (up
-- next), in-progress (an agent holds it), blocked, completed. Rules in lib/work/pipeline.ts.
ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS work_kind text NOT NULL DEFAULT 'task';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_steps_work_kind_check') THEN
    ALTER TABLE project_steps ADD CONSTRAINT project_steps_work_kind_check CHECK (work_kind IN ('task', 'initiative', 'upkeep'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS project_steps_project_kind_idx ON project_steps (project_id, work_kind) WHERE deleted_at IS NULL;

-- Test residue: a custom board column 'e2e-temp' replaced the planner's whole board, and rows an end-to-end run made
-- and marked for deletion were left in progress. Only rows that name themselves as test rows are touched.
UPDATE project_steps SET deleted_at = now()
  WHERE deleted_at IS NULL AND (status = 'e2e-temp' OR title LIKE 'E2E % (auto-delete)');
DELETE FROM project_statuses WHERE key = 'e2e-temp';

-- A project with its own columns gets a Requests column first, so proposed features have somewhere to wait.
INSERT INTO project_statuses (project_id, key, label, color, order_index, kind)
SELECT DISTINCT s.project_id, 'requested', 'Requests', '#8b5cf6', -1, 'open'
FROM project_statuses s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM project_statuses r WHERE r.project_id = s.project_id AND r.key = 'requested' AND r.deleted_at IS NULL);
