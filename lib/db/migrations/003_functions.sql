-- Migration 003: Database Functions
-- Creates functions for business logic automation

-- Function: Update project progress based on step completion
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET
    progress = (
      SELECT COALESCE(ROUND(AVG(progress)), 0)
      FROM project_steps
      WHERE project_id = NEW.project_id
        AND deleted_at IS NULL
    ),
    updated_at = NOW()
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Update project status based on steps
CREATE OR REPLACE FUNCTION update_project_status()
RETURNS TRIGGER AS $$
DECLARE
  total_steps INTEGER;
  completed_steps INTEGER;
  in_progress_steps INTEGER;
  new_status TEXT;
BEGIN
  -- Count steps
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'in-progress')
  INTO total_steps, completed_steps, in_progress_steps
  FROM project_steps
  WHERE project_id = NEW.project_id
    AND deleted_at IS NULL;

  -- Determine new status
  IF completed_steps = total_steps AND total_steps > 0 THEN
    new_status := 'completed';
  ELSIF in_progress_steps > 0 THEN
    new_status := 'in-progress';
  ELSIF completed_steps > 0 THEN
    new_status := 'in-progress';
  ELSE
    new_status := 'planning';
  END IF;

  -- Update project if status changed
  UPDATE projects
  SET
    status = new_status,
    completed_date = CASE WHEN new_status = 'completed' THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = NEW.project_id
    AND (status != new_status OR (new_status = 'completed' AND completed_date IS NULL));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate project health score
CREATE OR REPLACE FUNCTION calculate_project_health(p_project_id UUID)
RETURNS JSONB AS $$
DECLARE
  total_steps INTEGER;
  completed_steps INTEGER;
  blocked_steps INTEGER;
  overdue_steps INTEGER;
  health_score INTEGER;
  health_status TEXT;
  blockers JSONB;
  risks JSONB;
BEGIN
  -- Get step counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE is_blocked = true),
    COUNT(*) FILTER (WHERE status != 'completed' AND created_at < NOW() - INTERVAL '7 days')
  INTO total_steps, completed_steps, blocked_steps, overdue_steps
  FROM project_steps
  WHERE project_id = p_project_id
    AND deleted_at IS NULL;

  -- Calculate health score (0-100)
  health_score := 100;
  health_score := health_score - (blocked_steps * 20); -- Blockers reduce health
  health_score := health_score - (overdue_steps * 10); -- Overdue steps reduce health

  IF total_steps > 0 THEN
    health_score := health_score + ((completed_steps * 100) / total_steps) / 2; -- Progress improves health
  END IF;

  health_score := GREATEST(0, LEAST(100, health_score)); -- Clamp to 0-100

  -- Determine status
  IF health_score >= 80 THEN
    health_status := 'excellent';
  ELSIF health_score >= 60 THEN
    health_status := 'good';
  ELSIF health_score >= 40 THEN
    health_status := 'fair';
  ELSE
    health_status := 'poor';
  END IF;

  -- Get blockers
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'step_id', ps.id,
    'title', ps.title,
    'dependencies', (
      SELECT jsonb_agg(dep_ps.title)
      FROM step_dependencies sd
      JOIN project_steps dep_ps ON sd.depends_on_step_id = dep_ps.id
      WHERE sd.step_id = ps.id
        AND dep_ps.status != 'completed'
        AND sd.deleted_at IS NULL
        AND dep_ps.deleted_at IS NULL
    )
  )), '[]'::jsonb)
  INTO blockers
  FROM project_steps ps
  WHERE ps.project_id = p_project_id
    AND ps.is_blocked = true
    AND ps.deleted_at IS NULL;

  -- Build result
  RETURN jsonb_build_object(
    'health_score', health_score,
    'health_status', health_status,
    'total_steps', total_steps,
    'completed_steps', completed_steps,
    'blocked_steps', blocked_steps,
    'overdue_steps', overdue_steps,
    'blockers', blockers,
    'completion_percentage', CASE WHEN total_steps > 0 THEN (completed_steps * 100) / total_steps ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Get next recommended actions for a project
CREATE OR REPLACE FUNCTION get_next_actions(p_project_id UUID)
RETURNS JSONB AS $$
DECLARE
  next_steps JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'step_id', id,
    'title', title,
    'description', description,
    'phase', phase,
    'stage', stage,
    'estimated_hours', estimated_hours,
    'order_index', order_index
  ) ORDER BY order_index), '[]'::jsonb)
  INTO next_steps
  FROM project_steps
  WHERE project_id = p_project_id
    AND should_work = true
    AND deleted_at IS NULL
  LIMIT 3;

  RETURN jsonb_build_object(
    'next_steps', next_steps,
    'recommended_action', CASE
      WHEN jsonb_array_length(next_steps) > 0 THEN
        'Start working on: ' || (next_steps->0->>'title')
      ELSE
        'No available steps - check for blockers'
    END
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Get dependency graph for a project
CREATE OR REPLACE FUNCTION get_dependency_graph(p_project_id UUID)
RETURNS JSONB AS $$
DECLARE
  nodes JSONB;
  edges JSONB;
BEGIN
  -- Get all steps as nodes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'status', status,
    'progress', progress,
    'phase', phase,
    'can_work', can_work,
    'is_blocked', is_blocked
  ) ORDER BY order_index), '[]'::jsonb)
  INTO nodes
  FROM project_steps
  WHERE project_id = p_project_id
    AND deleted_at IS NULL;

  -- Get all dependencies as edges
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from', depends_on_step_id,
    'to', step_id,
    'type', dependency_type
  )), '[]'::jsonb)
  INTO edges
  FROM step_dependencies
  WHERE step_id IN (
    SELECT id FROM project_steps WHERE project_id = p_project_id AND deleted_at IS NULL
  )
  AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'nodes', nodes,
    'edges', edges
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_project_progress() IS 'Auto-updates project progress based on step completion';
COMMENT ON FUNCTION update_project_status() IS 'Auto-updates project status based on step statuses';
COMMENT ON FUNCTION calculate_project_health(UUID) IS 'Calculates project health score and identifies blockers';
COMMENT ON FUNCTION get_next_actions(UUID) IS 'Returns recommended next steps for a project';
COMMENT ON FUNCTION get_dependency_graph(UUID) IS 'Returns dependency graph for visualization';
