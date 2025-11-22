-- Migration 013: Project Versions
-- Enables continuous iteration: MVP → v1.0 → v1.1 → v2.0
-- Supports sprints, releases, and post-launch improvements

-- Create project versions table
CREATE TABLE project_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL, -- "MVP", "v1.0", "v1.1", "Sprint 1", "Q1 2025"
  version_number TEXT, -- Semver: "1.0.0", "1.1.0", "2.0.0"
  status TEXT NOT NULL CHECK (status IN ('planning', 'in-progress', 'completed', 'released')) DEFAULT 'planning',
  description TEXT,
  goals JSONB DEFAULT '[]'::jsonb, -- [{goal: "Add payment processing", completed: false}]
  release_notes TEXT, -- Markdown: what shipped in this version
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  released_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add version tracking to project steps
ALTER TABLE project_steps
  ADD COLUMN version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX idx_project_versions_project ON project_versions(project_id, created_at DESC);
CREATE INDEX idx_project_versions_status ON project_versions(status);
CREATE INDEX idx_project_steps_version ON project_steps(version_id) WHERE version_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE project_versions IS 'Project versions/iterations for continuous development (MVP, v1.0, v2.0, etc.)';
COMMENT ON COLUMN project_versions.version_name IS 'Human-readable version name (MVP, v1.0, Sprint 1)';
COMMENT ON COLUMN project_versions.version_number IS 'Semantic version number (1.0.0, 1.1.0, 2.0.0)';
COMMENT ON COLUMN project_versions.goals IS 'Array of version goals/objectives with completion status';
COMMENT ON COLUMN project_versions.release_notes IS 'Markdown-formatted release notes for this version';
COMMENT ON COLUMN project_steps.version_id IS 'Which version this step belongs to (NULL = initial/MVP)';

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_version_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_versions_updated_at
  BEFORE UPDATE ON project_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_version_updated_at();

-- Create function to get version progress
CREATE OR REPLACE FUNCTION get_version_progress(p_version_id UUID)
RETURNS TABLE(
  version_id UUID,
  version_name TEXT,
  status TEXT,
  total_steps INTEGER,
  completed_steps INTEGER,
  in_progress_steps INTEGER,
  pending_steps INTEGER,
  overall_progress INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.id,
    pv.version_name,
    pv.status::TEXT,
    COUNT(ps.id)::INTEGER as total_steps,
    COUNT(ps.id) FILTER (WHERE ps.status = 'completed')::INTEGER as completed_steps,
    COUNT(ps.id) FILTER (WHERE ps.status = 'in-progress')::INTEGER as in_progress_steps,
    COUNT(ps.id) FILTER (WHERE ps.status = 'pending')::INTEGER as pending_steps,
    CASE
      WHEN COUNT(ps.id) > 0 THEN
        (COUNT(ps.id) FILTER (WHERE ps.status = 'completed')::FLOAT / COUNT(ps.id) * 100)::INTEGER
      ELSE 0
    END as overall_progress
  FROM project_versions pv
  LEFT JOIN project_steps ps ON ps.version_id = pv.id AND ps.deleted_at IS NULL
  WHERE pv.id = p_version_id
  GROUP BY pv.id, pv.version_name, pv.status;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_version_progress IS 'Calculate progress statistics for a specific version';

-- Create function to list all project versions with progress
CREATE OR REPLACE FUNCTION get_project_versions(p_project_id UUID)
RETURNS TABLE(
  id UUID,
  version_name TEXT,
  version_number TEXT,
  status TEXT,
  description TEXT,
  total_steps INTEGER,
  completed_steps INTEGER,
  overall_progress INTEGER,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.id,
    pv.version_name,
    pv.version_number,
    pv.status::TEXT,
    pv.description,
    COUNT(ps.id)::INTEGER as total_steps,
    COUNT(ps.id) FILTER (WHERE ps.status = 'completed')::INTEGER as completed_steps,
    CASE
      WHEN COUNT(ps.id) > 0 THEN
        (COUNT(ps.id) FILTER (WHERE ps.status = 'completed')::FLOAT / COUNT(ps.id) * 100)::INTEGER
      ELSE 0
    END as overall_progress,
    pv.started_at,
    pv.completed_at,
    pv.created_at
  FROM project_versions pv
  LEFT JOIN project_steps ps ON ps.version_id = pv.id AND ps.deleted_at IS NULL
  WHERE pv.project_id = p_project_id
  GROUP BY pv.id
  ORDER BY pv.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_versions IS 'List all versions for a project with progress stats';

-- Auto-complete version when all steps are done
CREATE OR REPLACE FUNCTION auto_complete_version()
RETURNS TRIGGER AS $$
DECLARE
  v_version_id UUID;
  v_pending_count INTEGER;
BEGIN
  -- Only process when a step is marked as completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.version_id IS NOT NULL THEN
    v_version_id := NEW.version_id;

    -- Check if all steps in this version are completed
    SELECT COUNT(*) INTO v_pending_count
    FROM project_steps
    WHERE version_id = v_version_id
      AND status != 'completed'
      AND deleted_at IS NULL;

    -- If no pending steps, mark version as completed
    IF v_pending_count = 0 THEN
      UPDATE project_versions
      SET
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = v_version_id AND status != 'completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_complete_version_trigger
  AFTER UPDATE OF status ON project_steps
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_version();

COMMENT ON TRIGGER auto_complete_version_trigger ON project_steps IS 'Auto-mark version as completed when all its steps are done';
