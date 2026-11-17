-- 080: a record of every blocker, from the moment a card is blocked until it is cleared (card 570e7e98).
--
-- A card could be marked blocked, with a free-text reason, but nothing said what it was waiting on, how long it had
-- waited, or how it was cleared and by whom. step_blockers keeps one row per blocking: opened when a card enters the
-- 'blocked' status, closed when it leaves it. raise_blocker / resolve_blocker (MCP) fill in what it waits on and how
-- it was cleared; a status change from the board closes it too, so the record never depends on an agent remembering.

CREATE TABLE IF NOT EXISTS step_blockers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id            uuid NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason             text NOT NULL,
  waiting_on         text NOT NULL DEFAULT 'unknown' CHECK (waiting_on IN ('owner', 'card', 'outside', 'unknown')),
  question_id        uuid NULL,
  depends_on_step_id uuid NULL REFERENCES project_steps(id) ON DELETE SET NULL,
  raised_by          text NULL,
  raised_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz NULL,
  resolved_by        text NULL,
  resolution         text NULL
);

-- One open blocker per card at a time.
CREATE UNIQUE INDEX IF NOT EXISTS step_blockers_one_open ON step_blockers (step_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS step_blockers_project_open ON step_blockers (project_id, raised_at) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.track_step_blocker()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'blocked' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'blocked') THEN
    INSERT INTO step_blockers (step_id, project_id, reason, raised_by)
    VALUES (NEW.id, NEW.project_id, COALESCE(NULLIF(btrim(NEW.blocked_reason), ''), 'No reason given'), 'board')
    ON CONFLICT (step_id) WHERE resolved_at IS NULL DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'blocked' AND NEW.status IS DISTINCT FROM 'blocked' THEN
    -- A resolution an agent already wrote (resolve_blocker) is kept; a move on the board is recorded as one.
    UPDATE step_blockers
       SET resolved_at = now(),
           resolved_by = COALESCE(resolved_by, 'board'),
           resolution  = COALESCE(resolution, 'Moved to ' || NEW.status)
     WHERE step_id = NEW.id AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_track_step_blocker ON project_steps;
CREATE TRIGGER trigger_track_step_blocker
  AFTER INSERT OR UPDATE OF status ON project_steps
  FOR EACH ROW EXECUTE FUNCTION public.track_step_blocker();

-- Cards blocked before this existed get their open record, dated from their last change.
INSERT INTO step_blockers (step_id, project_id, reason, raised_by, raised_at)
SELECT s.id, s.project_id, COALESCE(NULLIF(btrim(s.blocked_reason), ''), 'No reason given'), 'board', COALESCE(s.updated_at, now())
  FROM project_steps s
 WHERE s.status = 'blocked' AND s.deleted_at IS NULL
ON CONFLICT (step_id) WHERE resolved_at IS NULL DO NOTHING;
