-- Migration 014: Feature Requests & Improvements
-- Track bugs, enhancements, and feature requests post-launch
-- Enables continuous improvement after MVP/initial release

-- Create feature requests table
CREATE TABLE feature_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('enhancement', 'bug', 'feature', 'tech_debt', 'refactor')) DEFAULT 'feature',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'in-progress', 'completed', 'rejected', 'deferred')) DEFAULT 'proposed',
  requested_by TEXT NOT NULL, -- Human name or agent name
  requested_by_type TEXT CHECK (requested_by_type IN ('human', 'agent')) DEFAULT 'human',
  approved_by TEXT,
  assigned_to_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
  created_step_id UUID REFERENCES project_steps(id) ON DELETE SET NULL, -- Auto-created step to implement this
  impact TEXT, -- Business impact description
  effort_estimate TEXT, -- "small", "medium", "large" or hours estimate
  acceptance_criteria JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb, -- screenshots, error logs, user feedback, etc.
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_feature_requests_project ON feature_requests(project_id, created_at DESC);
CREATE INDEX idx_feature_requests_status ON feature_requests(status);
CREATE INDEX idx_feature_requests_type ON feature_requests(request_type);
CREATE INDEX idx_feature_requests_priority ON feature_requests(priority);
CREATE INDEX idx_feature_requests_version ON feature_requests(assigned_to_version_id) WHERE assigned_to_version_id IS NOT NULL;
CREATE INDEX idx_feature_requests_step ON feature_requests(created_step_id) WHERE created_step_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE feature_requests IS 'Track feature requests, bugs, and improvements for continuous iteration';
COMMENT ON COLUMN feature_requests.request_type IS 'Type: enhancement, bug, feature, tech_debt, refactor';
COMMENT ON COLUMN feature_requests.requested_by IS 'Who requested this (human name or agent name)';
COMMENT ON COLUMN feature_requests.requested_by_type IS 'Whether requested by human or AI agent';
COMMENT ON COLUMN feature_requests.assigned_to_version_id IS 'Which version/iteration this is planned for';
COMMENT ON COLUMN feature_requests.created_step_id IS 'Project step automatically created to implement this request';
COMMENT ON COLUMN feature_requests.impact IS 'Business impact description';
COMMENT ON COLUMN feature_requests.effort_estimate IS 'Estimated effort (small/medium/large or hours)';
COMMENT ON COLUMN feature_requests.metadata IS 'Additional context: screenshots, logs, user feedback, analytics';

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_feature_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_requests_updated_at
  BEFORE UPDATE ON feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_request_updated_at();

-- Create function to approve and create step for feature request
CREATE OR REPLACE FUNCTION approve_and_create_step(
  p_feature_request_id UUID,
  p_approved_by TEXT,
  p_version_id UUID DEFAULT NULL,
  p_assigned_agent TEXT DEFAULT NULL
)
RETURNS TABLE(
  feature_request_id UUID,
  step_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_project_id UUID;
  v_title TEXT;
  v_description TEXT;
  v_acceptance_criteria JSONB;
  v_priority TEXT;
  v_step_id UUID;
  v_max_order INTEGER;
BEGIN
  -- Get feature request details
  SELECT
    fr.project_id,
    fr.title,
    fr.description,
    fr.acceptance_criteria,
    fr.priority
  INTO v_project_id, v_title, v_description, v_acceptance_criteria, v_priority
  FROM feature_requests fr
  WHERE fr.id = p_feature_request_id;

  IF v_project_id IS NULL THEN
    RETURN QUERY SELECT p_feature_request_id, NULL::UUID, FALSE, 'Feature request not found';
    RETURN;
  END IF;

  -- Get next order_index
  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM project_steps
  WHERE project_id = v_project_id AND deleted_at IS NULL;

  -- Create project step
  INSERT INTO project_steps (
    project_id,
    title,
    description,
    phase,
    stage,
    order_index,
    priority,
    assigned_agent,
    acceptance_criteria,
    version_id,
    status
  ) VALUES (
    v_project_id,
    v_title,
    v_description,
    'Improvements',
    'Enhancement',
    v_max_order + 1,
    v_priority,
    p_assigned_agent,
    v_acceptance_criteria,
    p_version_id,
    'pending'
  )
  RETURNING id INTO v_step_id;

  -- Update feature request
  UPDATE feature_requests
  SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = NOW(),
    created_step_id = v_step_id,
    assigned_to_version_id = COALESCE(p_version_id, assigned_to_version_id),
    updated_at = NOW()
  WHERE id = p_feature_request_id;

  -- Log to execution history
  INSERT INTO execution_history (
    project_id,
    step_id,
    event_type,
    description,
    new_value
  ) VALUES (
    v_project_id,
    v_step_id,
    'feature_request_approved',
    'Feature request approved and step created',
    jsonb_build_object('feature_request_id', p_feature_request_id, 'approved_by', p_approved_by)
  );

  RETURN QUERY SELECT p_feature_request_id, v_step_id, TRUE, 'Feature request approved and step created';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION approve_and_create_step IS 'Approve a feature request and automatically create a project step to implement it';

-- Create function to get feature request backlog
CREATE OR REPLACE FUNCTION get_feature_backlog(
  p_project_id UUID,
  p_status TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  request_type TEXT,
  priority TEXT,
  status TEXT,
  requested_by TEXT,
  version_name TEXT,
  step_title TEXT,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fr.id,
    fr.title,
    fr.description,
    fr.request_type::TEXT,
    fr.priority::TEXT,
    fr.status::TEXT,
    fr.requested_by,
    pv.version_name,
    ps.title as step_title,
    fr.created_at
  FROM feature_requests fr
  LEFT JOIN project_versions pv ON pv.id = fr.assigned_to_version_id
  LEFT JOIN project_steps ps ON ps.id = fr.created_step_id
  WHERE fr.project_id = p_project_id
    AND (p_status IS NULL OR fr.status = p_status)
    AND (p_type IS NULL OR fr.request_type = p_type)
  ORDER BY
    CASE fr.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    fr.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_feature_backlog IS 'Get prioritized feature request backlog with optional filtering';

-- Auto-complete feature request when step is completed
CREATE OR REPLACE FUNCTION auto_complete_feature_request()
RETURNS TRIGGER AS $$
BEGIN
  -- When a step is completed, mark associated feature request as completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE feature_requests
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE created_step_id = NEW.id
      AND status != 'completed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_complete_feature_request_trigger
  AFTER UPDATE OF status ON project_steps
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_feature_request();

COMMENT ON TRIGGER auto_complete_feature_request_trigger ON project_steps IS 'Auto-mark feature request as completed when its step is done';
