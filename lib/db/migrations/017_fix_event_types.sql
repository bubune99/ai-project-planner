-- Migration 017: Fix Event Types
-- Updates the execution_history check constraint to include new event types

-- Drop the existing constraint
ALTER TABLE execution_history DROP CONSTRAINT IF EXISTS execution_history_event_type_check;

-- Add the updated constraint with new types
ALTER TABLE execution_history ADD CONSTRAINT execution_history_event_type_check CHECK (event_type IN (
  'step_started',
  'step_completed',
  'blocker_identified',
  'status_changed',
  'ai_agent_action',
  'project_created',
  'project_updated',
  'phase_transition',
  'document_created',
  'document_updated',
  'document_deleted'
));

COMMENT ON TABLE execution_history IS 'Audit log of all project and step changes (updated with new event types)';
