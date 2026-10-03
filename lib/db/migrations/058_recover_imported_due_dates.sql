-- Migration 058: Recover the due dates the 057 backfill left in metadata
--
-- 057 carried each todo's due_date into metadata.original_due_date but never
-- populated project_steps.end_date. The result: 432 imported steps with no
-- schedule at all, and 33 real dates sitting one JSONB key away from the
-- timeline that needs them.
--
-- start_date is set to the earlier of the step's creation and its due date, so
-- the bar spans "known since" -> "due". LEAST guards the case where a todo was
-- created after its own due date, which would otherwise draw a backwards bar.
--
-- Touches only start_date/end_date, so it fires none of the status or progress
-- triggers on project_steps.

UPDATE project_steps
   SET end_date   = (metadata->>'original_due_date')::timestamp,
       start_date = LEAST(created_at, (metadata->>'original_due_date')::timestamp),
       updated_at = NOW()
 WHERE source_todo_id IS NOT NULL
   AND deleted_at IS NULL
   AND end_date IS NULL
   AND metadata ? 'original_due_date'
   AND metadata->>'original_due_date' <> '';
