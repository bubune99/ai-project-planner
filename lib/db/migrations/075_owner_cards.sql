-- 075: a card only the owner can do (work_kind 'owner'): keys, dashboards, accounts, payments.
-- Shown as "Needs you", listed under the project's Waiting on you, never sent to an agent (lib/work/pipeline.ts).
-- Found 2026-11-16: an "OWNER ACTION" card sat in Up next, where moving it sends it to an agent.
ALTER TABLE project_steps DROP CONSTRAINT IF EXISTS project_steps_work_kind_check;
ALTER TABLE project_steps ADD CONSTRAINT project_steps_work_kind_check
  CHECK (work_kind = ANY (ARRAY['task'::text, 'initiative'::text, 'upkeep'::text, 'owner'::text]));
