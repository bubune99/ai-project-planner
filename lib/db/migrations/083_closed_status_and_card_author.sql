-- 083: a Closed column for cards that will not be done, and who made each card.
--
-- Owner, 2026-11-19 (question 50ed74d2): "A Closed column, collapsed at the end, with the reason; each card shows who
-- made it". Until now a card that would never be done sat in Paused beside work that is only on hold, and nothing
-- recorded whether the owner or an agent made a card, so the board could not show agents filling Requests.
--
-- * status 'closed' is a built-in (no CHECK on project_steps.status since 052; the app lists the built-ins). Its
--   reason is kept in metadata.closed { why, at, by }.
-- * created_by: 'owner' for a card made in the owner's own session, else the agent's name. NULL for older cards:
--   nothing recorded who made them, and guessing would be inventing.
-- * A closed card does not count toward a project's progress (it is not work left to do), and its linked to-do leaves
--   the owner's open list.

ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS created_by TEXT;
COMMENT ON COLUMN project_steps.created_by IS 'Who made the card: owner, or the agent''s name. NULL before 2026-11-19.';

CREATE OR REPLACE FUNCTION public.step_status_kind(p_project_id uuid, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_kind TEXT;
BEGIN
  SELECT kind INTO v_kind FROM project_statuses
  WHERE project_id = p_project_id AND key = p_status AND deleted_at IS NULL;
  IF v_kind IS NOT NULL THEN RETURN v_kind; END IF;
  RETURN CASE p_status
    WHEN 'completed' THEN 'done'
    WHEN 'in-progress' THEN 'active'
    WHEN 'blocked' THEN 'closed'
    WHEN 'failed' THEN 'closed'
    WHEN 'closed' THEN 'closed'
    WHEN 'paused' THEN 'open'
    ELSE 'open'
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION step_status_to_todo_status(p_project_id UUID, p_status TEXT)
RETURNS TEXT AS $$
  -- A card closed as not to be done takes its to-do off the open list (todos have no cancelled state).
  SELECT CASE
    WHEN p_status = 'closed' THEN 'completed'
    ELSE CASE step_status_kind(p_project_id, p_status)
      WHEN 'done'   THEN 'completed'
      WHEN 'active' THEN 'in_progress'
      ELSE 'pending'
    END
  END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.update_project_progress()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_project_id UUID := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  UPDATE projects
  SET
    progress = (
      SELECT COALESCE(ROUND(AVG(
        CASE WHEN step_status_kind(ps.project_id, ps.status) = 'done'
             THEN 100
             ELSE COALESCE(ps.progress, 0)
        END
      )), 0)
      FROM project_steps ps
      WHERE ps.project_id = v_project_id
        AND ps.deleted_at IS NULL
        AND ps.status <> 'closed'
    ),
    updated_at = NOW()
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
