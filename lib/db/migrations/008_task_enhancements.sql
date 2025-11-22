-- Migration 008: Task/Step Enhancements
-- Adds agent assignment, timeline dates, and priority for Gantt/Kanban views

-- Add agent assignment column
ALTER TABLE project_steps
  ADD COLUMN assigned_agent TEXT CHECK (assigned_agent IN ('v0', 'claude', 'gemini', 'gpt', NULL));

-- Add timeline dates for Gantt view
ALTER TABLE project_steps
  ADD COLUMN start_date TIMESTAMP,
  ADD COLUMN end_date TIMESTAMP;

-- Add priority for Kanban view
ALTER TABLE project_steps
  ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high', NULL));

-- Update status enum to include 'paused' and 'failed'
ALTER TABLE project_steps
  DROP CONSTRAINT IF EXISTS project_steps_status_check;

ALTER TABLE project_steps
  ADD CONSTRAINT project_steps_status_check
  CHECK (status IN ('pending', 'in-progress', 'completed', 'blocked', 'paused', 'failed'));

-- Add acceptance criteria as structured data
ALTER TABLE project_steps
  ADD COLUMN acceptance_criteria JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN project_steps.assigned_agent IS 'Which AI agent is responsible for this task';
COMMENT ON COLUMN project_steps.start_date IS 'When this task should/did start (for Gantt timeline)';
COMMENT ON COLUMN project_steps.end_date IS 'When this task should/did end (for Gantt timeline)';
COMMENT ON COLUMN project_steps.priority IS 'Task priority level (for Kanban prioritization)';
COMMENT ON COLUMN project_steps.acceptance_criteria IS 'Array of criteria that define task completion: [{description: string, testCommand?: string}]';

-- Create index for agent-based queries
CREATE INDEX idx_project_steps_assigned_agent ON project_steps(assigned_agent) WHERE assigned_agent IS NOT NULL;

-- Create index for timeline queries
CREATE INDEX idx_project_steps_timeline ON project_steps(start_date, end_date) WHERE start_date IS NOT NULL;

-- Create index for priority queries
CREATE INDEX idx_project_steps_priority ON project_steps(priority, status) WHERE priority IS NOT NULL;

-- Create function to auto-set dates based on dependencies
CREATE OR REPLACE FUNCTION calculate_task_dates(p_step_id UUID)
RETURNS TABLE(suggested_start TIMESTAMP, suggested_end TIMESTAMP) AS $$
DECLARE
  v_max_dependency_end TIMESTAMP;
  v_estimated_hours DECIMAL;
BEGIN
  -- Get latest end date from dependencies
  SELECT MAX(ps.end_date) INTO v_max_dependency_end
  FROM step_dependencies sd
  JOIN project_steps ps ON ps.id = sd.depends_on_step_id
  WHERE sd.step_id = p_step_id
    AND sd.deleted_at IS NULL
    AND ps.deleted_at IS NULL;

  -- Get estimated hours for this task
  SELECT estimated_hours INTO v_estimated_hours
  FROM project_steps
  WHERE id = p_step_id;

  -- If no dependencies, suggest current time
  IF v_max_dependency_end IS NULL THEN
    v_max_dependency_end := NOW();
  END IF;

  -- Return suggested dates (start after dependencies, end based on estimated hours)
  RETURN QUERY SELECT
    v_max_dependency_end as suggested_start,
    v_max_dependency_end + (v_estimated_hours || ' hours')::interval as suggested_end;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_task_dates IS 'Calculates suggested start/end dates based on dependencies and estimated hours';
