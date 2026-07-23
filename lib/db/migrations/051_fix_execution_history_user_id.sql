-- Migration 051: Fix execution_history audit triggers to supply user_id
-- Migration 021 added execution_history.user_id and migration 022 made it
-- NOT NULL, but the audit trigger functions from migration 004 were never
-- updated and still inserted into execution_history WITHOUT user_id --
-- aborting the whole transaction (e.g. any INSERT into projects).
--
-- Fixes:
--   log_project_creation()      -> uses NEW.user_id (projects has user_id)
--   log_step_status_change()    -> derives owner from the parent project
--   log_blocker_identification()-> derives owner from the parent project
-- The two project_steps triggers fall back to the system user
-- ('00000000-0000-0000-0000-000000000001', seeded in migration 022) if the
-- parent project row cannot be found.

-- Trigger function: Log step status changes to execution history
CREATE OR REPLACE FUNCTION log_step_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Derive the owning user from the parent project (project_steps has no user_id)
  SELECT user_id INTO v_user_id FROM projects WHERE id = NEW.project_id;
  v_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000001');

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      old_value,
      new_value,
      user_id
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'status_changed',
      'Step status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('status', OLD.status, 'progress', OLD.progress),
      jsonb_build_object('status', NEW.status, 'progress', NEW.progress),
      v_user_id
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status != 'completed' AND NEW.status = 'completed' THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      new_value,
      user_id
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'step_completed',
      'Step "' || NEW.title || '" completed',
      jsonb_build_object(
        'estimated_hours', NEW.estimated_hours,
        'actual_hours', NEW.actual_hours,
        'variance', NEW.actual_hours - NEW.estimated_hours
      ),
      v_user_id
    );
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status != 'in-progress' AND NEW.status = 'in-progress' THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      user_id
    ) VALUES (
      NEW.project_id,
      NEW.id,
      'step_started',
      'Step "' || NEW.title || '" started',
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: Log blocker identification
CREATE OR REPLACE FUNCTION log_blocker_identification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Derive the owning user from the parent project (project_steps has no user_id)
  SELECT user_id INTO v_user_id FROM projects WHERE id = NEW.project_id;
  v_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000001');

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_blocked = false AND NEW.is_blocked = true) THEN
    INSERT INTO execution_history (
      project_id,
      step_id,
      event_type,
      description,
      metadata,
      user_id
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
      ),
      v_user_id
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

-- Trigger function: Log project creation
CREATE OR REPLACE FUNCTION log_project_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO execution_history (
    project_id,
    event_type,
    description,
    new_value,
    user_id
  ) VALUES (
    NEW.id,
    'project_created',
    'Project "' || NEW.name || '" created',
    jsonb_build_object(
      'name', NEW.name,
      'status', NEW.status,
      'priority', NEW.priority
    ),
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_step_status_change() IS 'Logs step status changes to execution history (user_id derived from parent project)';
COMMENT ON FUNCTION log_blocker_identification() IS 'Logs when steps become blocked (user_id derived from parent project)';
COMMENT ON FUNCTION log_project_creation() IS 'Logs project creation events (user_id from NEW.user_id)';

-- transition_to_phase() (from migration 015) has the same defect: it inserts a
-- 'phase_transition' event into execution_history without user_id, so every
-- phase transition aborts on the NOT NULL constraint.
CREATE OR REPLACE FUNCTION transition_to_phase(
  p_project_id UUID,
  p_new_phase TEXT,
  p_completed_by TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  new_phase_id UUID
) AS $$
DECLARE
  v_current_phase_id UUID;
  v_new_phase_id UUID;
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM projects WHERE id = p_project_id;
  v_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000001');

  -- Mark current phase as completed
  UPDATE project_phases
  SET
    status = 'completed',
    completed_at = NOW(),
    completed_by = p_completed_by,
    updated_at = NOW()
  WHERE project_id = p_project_id
    AND status = 'active'
  RETURNING id INTO v_current_phase_id;

  -- Create new phase
  INSERT INTO project_phases (
    project_id,
    phase_name,
    status,
    description,
    started_at
  ) VALUES (
    p_project_id,
    p_new_phase,
    'active',
    p_description,
    NOW()
  )
  RETURNING id INTO v_new_phase_id;

  -- Update project's current_phase field
  UPDATE projects
  SET
    current_phase = p_new_phase,
    updated_at = NOW()
  WHERE id = p_project_id;

  -- Log to execution history
  INSERT INTO execution_history (
    project_id,
    event_type,
    description,
    new_value,
    user_id
  ) VALUES (
    p_project_id,
    'phase_transition',
    'Project transitioned to ' || p_new_phase || ' phase',
    jsonb_build_object('new_phase', p_new_phase, 'completed_by', p_completed_by),
    v_user_id
  );

  RETURN QUERY SELECT TRUE, 'Phase transition successful', v_new_phase_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION transition_to_phase IS 'Complete current phase and transition to next phase (user_id derived from project owner)';
