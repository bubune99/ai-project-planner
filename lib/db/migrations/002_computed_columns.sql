-- Migration 002: Add Computed Columns
-- Adds calculated fields for can_work, is_blocked, should_work, is_in_progress
-- Note: These are regular columns that will be updated by triggers (added in migration 004)

-- Add can_work column (true if all dependencies are completed or no dependencies)
-- Will be updated by triggers
ALTER TABLE project_steps
ADD COLUMN can_work BOOLEAN DEFAULT TRUE NOT NULL;

-- Add is_blocked column (true if has incomplete dependencies)
-- Will be updated by triggers
ALTER TABLE project_steps
ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE NOT NULL;

-- Add should_work column (recommendation for next step to work on)
-- Will be updated by triggers
ALTER TABLE project_steps
ADD COLUMN should_work BOOLEAN DEFAULT FALSE NOT NULL;

-- Add is_in_progress column (check for in-progress status)
-- Will be updated by triggers
ALTER TABLE project_steps
ADD COLUMN is_in_progress BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comments
COMMENT ON COLUMN project_steps.can_work IS 'True if all dependencies are completed';
COMMENT ON COLUMN project_steps.is_blocked IS 'True if waiting on incomplete dependencies';
COMMENT ON COLUMN project_steps.should_work IS 'Recommended next step to work on';
COMMENT ON COLUMN project_steps.is_in_progress IS 'Currently being worked on';
