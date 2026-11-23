-- 089: a project's status and progress follow a card being deleted, restored or moved to another project.
--
-- Both are worked out from the project's cards by triggers on project_steps, but the triggers fired only on
-- INSERT and on UPDATE OF status (and progress). Deleting a card sets deleted_at, which fired neither, so a
-- project whose cards were all deleted kept "completed" (shown as Done, 0 of 0 tasks), and its progress kept
-- counting the deleted cards. Found on staging 2026-11-23: Health & Habits read Done with no cards.
--
-- No data is changed here: the figures correct themselves on the next change to any of a project's cards.

CREATE OR REPLACE FUNCTION update_project_status()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID := COALESCE(NEW.project_id, OLD.project_id);
  total_steps INTEGER;
  completed_steps INTEGER;
  in_progress_steps INTEGER;
  new_status TEXT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'in-progress')
  INTO total_steps, completed_steps, in_progress_steps
  FROM project_steps
  WHERE project_id = v_project_id
    AND deleted_at IS NULL;

  IF completed_steps = total_steps AND total_steps > 0 THEN
    new_status := 'completed';
  ELSIF in_progress_steps > 0 THEN
    new_status := 'in-progress';
  ELSIF completed_steps > 0 THEN
    new_status := 'in-progress';
  ELSE
    new_status := 'planning';
  END IF;

  UPDATE projects
  SET
    status = new_status,
    completed_date = CASE WHEN new_status = 'completed' THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = v_project_id
    AND (status != new_status OR (new_status = 'completed' AND completed_date IS NULL));

  -- A card moved to another project changes both: work out the one it left too.
  IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'in-progress')
    INTO total_steps, completed_steps, in_progress_steps
    FROM project_steps
    WHERE project_id = OLD.project_id
      AND deleted_at IS NULL;

    IF completed_steps = total_steps AND total_steps > 0 THEN
      new_status := 'completed';
    ELSIF in_progress_steps > 0 OR completed_steps > 0 THEN
      new_status := 'in-progress';
    ELSE
      new_status := 'planning';
    END IF;

    UPDATE projects
    SET
      status = new_status,
      completed_date = CASE WHEN new_status = 'completed' THEN NOW() ELSE NULL END,
      updated_at = NOW()
    WHERE id = OLD.project_id
      AND (status != new_status OR (new_status = 'completed' AND completed_date IS NULL));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_status ON project_steps;
CREATE TRIGGER trigger_update_project_status
AFTER INSERT OR DELETE OR UPDATE OF status, deleted_at, project_id ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_project_status();

DROP TRIGGER IF EXISTS trigger_update_project_progress ON project_steps;
CREATE TRIGGER trigger_update_project_progress
AFTER INSERT OR DELETE OR UPDATE OF progress, status, deleted_at ON project_steps
FOR EACH ROW
EXECUTE FUNCTION update_project_progress();
