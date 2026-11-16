-- A task created already completed got no completed_at: the trigger from 004 fired only on UPDATE OF status.
-- Metrics counts finished work by that date, so such tasks vanished from "done" by week (Metrics check, 2026-11-15:
-- 14 completed, 12 dated; 44 undated across projects on 2026-11-16, every one inserted as completed).

CREATE OR REPLACE FUNCTION set_step_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at = NOW();
    END IF;
  ELSIF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_step_completed_at ON project_steps;
CREATE TRIGGER trigger_set_step_completed_at
BEFORE INSERT OR UPDATE OF status ON project_steps
FOR EACH ROW
EXECUTE FUNCTION set_step_completed_at();

-- The undated ones: the best date there is for when they were finished is when they were last changed.
-- updated_at is left as it was (its trigger is paused for this one statement), so these do not look edited today.
ALTER TABLE project_steps DISABLE TRIGGER trigger_project_steps_updated_at;
UPDATE project_steps
   SET completed_at = COALESCE(updated_at, created_at)
 WHERE status = 'completed' AND completed_at IS NULL;
ALTER TABLE project_steps ENABLE TRIGGER trigger_project_steps_updated_at;
