-- 074: a report is marked fixed when the card made from it is completed (intake, lib/intake/report-card.ts).
-- Owner, 2026-11-16: reports must feed the board directly; agents finish the card, and the report follows it, so he
-- never has to close the same thing twice. Reopening the card reopens the report.

CREATE OR REPLACE FUNCTION public.report_follows_card()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      UPDATE feedback SET status = 'fixed', resolved_at = NOW(), updated_at = NOW()
       WHERE metadata->>'stepId' = NEW.id::text AND status <> 'fixed';
    ELSIF OLD.status = 'completed' THEN
      UPDATE feedback SET status = 'open', resolved_at = NULL, updated_at = NOW()
       WHERE metadata->>'stepId' = NEW.id::text AND status = 'fixed';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_report_follows_card ON project_steps;
CREATE TRIGGER trigger_report_follows_card
  AFTER UPDATE OF status ON project_steps
  FOR EACH ROW EXECUTE FUNCTION public.report_follows_card();
