-- 078: the step computed fields write only the rows whose values change (card 94f402cc).
--
-- update_step_computed_fields ran after every status or order change and rewrote EVERY step of the project (twice):
-- can_work, is_blocked, is_in_progress, then should_work. Two updates in the same project at once each locked all of
-- the project's rows in no fixed order, so concurrent update_task calls ended in "deadlock detected" (33 of 95 calls
-- four at a time, 2026-11-16). Each of those rewrites also fired the per-row triggers that run on any update
-- (log_step_status_change, log_blocker_identification, which logged a blocker row for every blocked step each time).
--
-- Same values as before; only rows whose value differs are written. A status change now touches the step itself,
-- the steps that depend on it, and the one or two whose should_work flips.

CREATE OR REPLACE FUNCTION public.update_step_computed_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_project_id UUID;
  v_step_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN v_step_id := OLD.id; ELSE v_step_id := NEW.id; END IF;

  SELECT project_id INTO v_project_id FROM project_steps WHERE id = v_step_id;
  IF v_project_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  WITH calc AS (
    SELECT s.id,
           NOT EXISTS (
             SELECT 1 FROM step_dependencies sd
             JOIN project_steps ps ON sd.depends_on_step_id = ps.id
             WHERE sd.step_id = s.id AND ps.status != 'completed'
               AND sd.deleted_at IS NULL AND ps.deleted_at IS NULL
           ) AS can_work,
           (s.status = 'in-progress') AS is_in_progress
      FROM project_steps s
     WHERE s.project_id = v_project_id AND s.deleted_at IS NULL
  )
  UPDATE project_steps p
     SET can_work = c.can_work, is_blocked = NOT c.can_work, is_in_progress = c.is_in_progress
    FROM calc c
   WHERE p.id = c.id
     AND (p.can_work IS DISTINCT FROM c.can_work
          OR p.is_blocked IS DISTINCT FROM (NOT c.can_work)
          OR p.is_in_progress IS DISTINCT FROM c.is_in_progress);

  WITH first_open AS (
    SELECT MIN(ps2.order_index) AS mo FROM project_steps ps2
     WHERE ps2.project_id = v_project_id AND ps2.status = 'pending' AND ps2.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM step_dependencies sd
         JOIN project_steps ps3 ON sd.depends_on_step_id = ps3.id
         WHERE sd.step_id = ps2.id AND ps3.status != 'completed'
           AND sd.deleted_at IS NULL AND ps3.deleted_at IS NULL
       )
  ), calc2 AS (
    SELECT ps1.id,
           (ps1.status = 'pending' AND ps1.can_work = true AND ps1.order_index = (SELECT mo FROM first_open)) AS should_work
      FROM project_steps ps1
     WHERE ps1.project_id = v_project_id AND ps1.deleted_at IS NULL
  )
  UPDATE project_steps p
     SET should_work = c.should_work
    FROM calc2 c
   WHERE p.id = c.id AND p.should_work IS DISTINCT FROM c.should_work;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
