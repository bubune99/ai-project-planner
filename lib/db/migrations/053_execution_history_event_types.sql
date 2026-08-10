-- Migration 053: execution_history event_type CHECK vs reality
--
-- The API routes have logged 'step_created', 'step_updated', 'step_deleted',
-- 'progress_note_added', and 'document_uploaded' since they were written, but
-- the CHECK constraint never allowed them — every such insert failed inside a
-- silent .catch(). Result: the step activity timeline was empty forever.
-- Extend the constraint to the union of old allowed values + values the code
-- actually writes (+ comment_added for the wave-2 comments feature).

ALTER TABLE execution_history DROP CONSTRAINT IF EXISTS execution_history_event_type_check;

ALTER TABLE execution_history ADD CONSTRAINT execution_history_event_type_check
  CHECK (event_type IN (
    'step_started', 'step_completed', 'blocker_identified', 'status_changed',
    'ai_agent_action', 'project_created', 'project_updated', 'phase_transition',
    'document_created', 'document_updated', 'document_deleted',
    'step_created', 'step_updated', 'step_deleted',
    'progress_note_added', 'document_uploaded', 'comment_added'
  ));
