-- 079: a finished card closes the work jobs still waiting for it.
--
-- Starting a card (lib/work/send.ts) opens a work job for the project's agents. Nothing closed that job when the card
-- was finished another way (an agent's ship, the board, a subtask roll-up), so on 2026-11-17 37 finished cards still
-- had waiting jobs: an agent listening for work would be handed finished work, and the board read them as in line.
-- When a card's status becomes a done status, its pending, queued or assigned jobs are cancelled with the reason in
-- metadata. Jobs an agent already holds (claimed, in_progress) are left alone. Questions (awaiting-unlock) untouched.
--
-- Rollback: DROP TRIGGER IF EXISTS trigger_close_jobs_of_finished_card ON project_steps;
--           DROP FUNCTION IF EXISTS close_jobs_of_finished_card();
--           (the one-time close below marks its rows with metadata.closedBecause = 'card finished (079)')

CREATE OR REPLACE FUNCTION public.close_jobs_of_finished_card()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (
       NEW.status = 'completed'
       OR EXISTS (SELECT 1 FROM project_statuses s WHERE s.project_id = NEW.project_id AND s.key = NEW.status AND s.kind = 'done' AND s.deleted_at IS NULL)
     ) THEN
    UPDATE agent_jobs
       SET status = 'cancelled', updated_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('closedBecause', 'card finished', 'closedAt', now())
     WHERE parent_step_id = NEW.id AND status IN ('pending', 'queued', 'assigned');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_close_jobs_of_finished_card ON public.project_steps;
CREATE TRIGGER trigger_close_jobs_of_finished_card
  AFTER UPDATE OF status ON public.project_steps
  FOR EACH ROW EXECUTE FUNCTION public.close_jobs_of_finished_card();

-- Once: close the jobs already left open on finished or deleted cards.
UPDATE agent_jobs j
   SET status = 'cancelled', updated_at = now(),
       metadata = COALESCE(j.metadata, '{}'::jsonb) || jsonb_build_object('closedBecause', 'card finished (079)', 'closedAt', now())
  FROM project_steps st
 WHERE st.id = j.parent_step_id
   AND j.status IN ('pending', 'queued', 'assigned')
   AND (st.deleted_at IS NOT NULL
        OR st.status = 'completed'
        OR EXISTS (SELECT 1 FROM project_statuses s WHERE s.project_id = st.project_id AND s.key = st.status AND s.kind = 'done' AND s.deleted_at IS NULL));
