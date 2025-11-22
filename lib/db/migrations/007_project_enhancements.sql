-- Migration 007: Project Enhancements
-- Adds current_phase and health tracking for Mission Control UI

-- Add current_phase column for phase tracking
ALTER TABLE projects
  ADD COLUMN current_phase TEXT;

-- Add health status for project health monitoring
ALTER TABLE projects
  ADD COLUMN health TEXT CHECK (health IN ('excellent', 'good', 'attention', 'critical'));

-- Update status enum to include 'review' status
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('planning', 'in-progress', 'review', 'completed', 'on-hold'));

-- Add comments for documentation
COMMENT ON COLUMN projects.current_phase IS 'Current phase of the project (e.g., "Phase 2 of 4: Core Features")';
COMMENT ON COLUMN projects.health IS 'Overall project health based on blockers, delays, and progress';

-- Create function to auto-calculate project health
DROP FUNCTION IF EXISTS calculate_project_health(UUID);
CREATE OR REPLACE FUNCTION calculate_project_health(p_project_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_blocked_count INTEGER;
  v_overdue_count INTEGER;
  v_total_tasks INTEGER;
  v_progress INTEGER;
  v_health TEXT;
BEGIN
  -- Count blocked tasks
  SELECT COUNT(*) INTO v_blocked_count
  FROM project_steps
  WHERE project_id = p_project_id AND status = 'blocked' AND deleted_at IS NULL;

  -- Count total tasks
  SELECT COUNT(*) INTO v_total_tasks
  FROM project_steps
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Get project progress
  SELECT progress INTO v_progress
  FROM projects
  WHERE id = p_project_id;

  -- Calculate health
  IF v_total_tasks = 0 THEN
    v_health := 'good';
  ELSIF v_blocked_count >= (v_total_tasks * 0.3) THEN
    v_health := 'critical';
  ELSIF v_blocked_count >= (v_total_tasks * 0.15) THEN
    v_health := 'attention';
  ELSIF v_progress >= 80 THEN
    v_health := 'excellent';
  ELSE
    v_health := 'good';
  END IF;

  RETURN v_health;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_project_health IS 'Automatically calculates project health based on blocked tasks and progress';
