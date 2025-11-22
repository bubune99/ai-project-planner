-- Migration 004: Triggers
-- Creates triggers for automatic business logic execution

-- Trigger: Update project progress when steps change
CREATE TRIGGER trigger_update_project_progress
AFTER INSERT OR UPDATE OF progress, status ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_project_progress();

-- Trigger: Update project status when steps change
CREATE TRIGGER trigger_update_project_status
AFTER INSERT OR UPDATE OF status ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_project_status();

-- Trigger: Log step status changes to execution history
CREATE OR REPLACE FUNCTION log_step_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      old_value,
      new_value
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'status_changed',
      'Step status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('status', OLD.status, 'progress', OLD.progress),
      jsonb_build_object('status', NEW.status, 'progress', NEW.progress)
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status != 'completed' AND NEW.status = 'completed' THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      new_value
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'step_completed',
      'Step "' || NEW.title || '" completed',
      jsonb_build_object(
        'estimated_hours', NEW.estimated_hours,
        'actual_hours', NEW.actual_hours,
        'variance', NEW.actual_hours - NEW.estimated_hours
      )
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status != 'in-progress' AND NEW.status = 'in-progress' THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'step_started',
      'Step "' || NEW.title || '" started'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_step_status_change
AFTER UPDATE ON project_steps
FOR EACH ROW
EXECUTE FUNCTION log_step_status_change();

-- Trigger: Log blocker identification
CREATE OR REPLACE FUNCTION log_blocker_identification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_blocked = false AND NEW.is_blocked = true) THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      metadata
    )
    SELECT
      NEW.project_id,
      NEW.id,
      'blocker_identified',
      'Step "' || NEW.title || '" is blocked by ' || COUNT(*) || ' incomplete dependencies',
      jsonb_build_object(
        'blocking_steps', jsonb_agg(jsonb_build_object(
          'step_id', ps.id,
          'title', ps.title,
          'status', ps.status
        ))
      )
    FROM step_dependencies sd
    JOIN project_steps ps ON sd.depends_on_step_id = ps.id
    WHERE sd.step_id = NEW.id
      AND ps.status != 'completed'
      AND sd.deleted_at IS NULL
      AND ps.deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_blocker_identification
AFTER INSERT OR UPDATE ON project_steps
FOR EACH ROW
WHEN (NEW.is_blocked = true)
EXECUTE FUNCTION log_blocker_identification();

-- Trigger: Log project creation
CREATE OR REPLACE FUNCTION log_project_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO execution_history (
    project_id,
    event_type,
    description,
    new_value
  ) VALUES (
    NEW.id,
    'project_created',
    'Project "' || NEW.name || '" created',
    jsonb_build_object(
      'name', NEW.name,
      'status', NEW.status,
      'priority', NEW.priority
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_project_creation
AFTER INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION log_project_creation();

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_project_steps_updated_at
BEFORE UPDATE ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tech_stack_items_updated_at
BEFORE UPDATE ON tech_stack_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_business_context_updated_at
BEFORE UPDATE ON business_context
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Trigger: Set completed_at when step is marked as completed
CREATE OR REPLACE FUNCTION set_step_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_step_completed_at
BEFORE UPDATE OF status ON project_steps
FOR EACH ROW
EXECUTE FUNCTION set_step_completed_at();

COMMENT ON FUNCTION log_step_status_change() IS 'Logs step status changes to execution history';
COMMENT ON FUNCTION log_blocker_identification() IS 'Logs when steps become blocked';
COMMENT ON FUNCTION log_project_creation() IS 'Logs project creation events';
COMMENT ON FUNCTION update_updated_at() IS 'Auto-updates the updated_at timestamp';
COMMENT ON FUNCTION set_step_completed_at() IS 'Auto-sets completed_at timestamp';

-- Trigger: Update computed columns (can_work, is_blocked, should_work, is_in_progress)
CREATE OR REPLACE FUNCTION update_step_computed_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- Determine which project to update
  IF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE
    v_project_id := NEW.project_id;
  END IF;

  -- Update all steps in the project
  UPDATE project_steps
  SET
    can_work = NOT EXISTS (
      SELECT 1
      FROM step_dependencies sd
      JOIN project_steps ps ON sd.depends_on_step_id = ps.id
      WHERE sd.step_id = project_steps.id
        AND ps.status != 'completed'
        AND sd.deleted_at IS NULL
        AND ps.deleted_at IS NULL
    ),
    is_blocked = EXISTS (
      SELECT 1
      FROM step_dependencies sd
      JOIN project_steps ps ON sd.depends_on_step_id = ps.id
      WHERE sd.step_id = project_steps.id
        AND ps.status != 'completed'
        AND sd.deleted_at IS NULL
        AND ps.deleted_at IS NULL
    ),
    is_in_progress = (status = 'in-progress')
  WHERE project_id = v_project_id
    AND deleted_at IS NULL;

  -- Update should_work (only one step per project should be recommended)
  UPDATE project_steps ps1
  SET should_work = (
    ps1.status = 'pending'
    AND ps1.can_work = true
    AND ps1.order_index = (
      SELECT MIN(ps2.order_index)
      FROM project_steps ps2
      WHERE ps2.project_id = ps1.project_id
        AND ps2.status = 'pending'
        AND ps2.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM step_dependencies sd
          JOIN project_steps ps3 ON sd.depends_on_step_id = ps3.id
          WHERE sd.step_id = ps2.id
            AND ps3.status != 'completed'
            AND sd.deleted_at IS NULL
            AND ps3.deleted_at IS NULL
        )
    )
  )
  WHERE ps1.project_id = v_project_id
    AND ps1.deleted_at IS NULL;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger on project_steps when status changes
CREATE TRIGGER trigger_update_step_computed_fields
AFTER INSERT OR UPDATE OF status, order_index OR DELETE ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_step_computed_fields();

-- Trigger on step_dependencies when dependencies change
CREATE TRIGGER trigger_update_computed_on_dependency_change
AFTER INSERT OR UPDATE OR DELETE ON step_dependencies
FOR EACH ROW
EXECUTE FUNCTION update_step_computed_fields();

COMMENT ON FUNCTION update_step_computed_fields() IS 'Updates can_work, is_blocked, should_work, is_in_progress fields';
