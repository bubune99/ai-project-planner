-- 073: a parent card is never put in progress by its subtasks.
--
-- Owner, 2026-11-16: "In progress should be that we moved it there and you have finished or are working on it. There
-- should never be anything stale in in progress". update_parent_progress() set a parent to 'in-progress' whenever any
-- subtask changed while their average progress was above 0, so parents landed in In progress with nobody holding them
-- (found when two Dzidzor cards moved back to In progress within the same second as their subtasks were moved).
-- A parent still takes its subtasks' average progress and is completed when every subtask is; its column is otherwise
-- left alone (in progress only while an agent holds it, lib/work/pipeline.ts).

CREATE OR REPLACE FUNCTION public.update_parent_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_parent_id UUID;
  v_avg_progress DECIMAL;
  v_all_completed BOOLEAN;
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_parent_id := NEW.parent_task_id;

  SELECT AVG(progress)::INTEGER, BOOL_AND(status = 'completed')
  INTO v_avg_progress, v_all_completed
  FROM project_steps
  WHERE parent_task_id = v_parent_id AND deleted_at IS NULL;

  UPDATE project_steps
  SET progress = COALESCE(v_avg_progress, 0),
      status = CASE WHEN v_all_completed THEN 'completed' ELSE status END,
      updated_at = NOW()
  WHERE id = v_parent_id;

  RETURN NEW;
END;
$function$;
