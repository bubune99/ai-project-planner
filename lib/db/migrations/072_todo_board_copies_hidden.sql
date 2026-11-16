-- 072: board copies leave the owner's to-do list (reversible).
--
-- Owner, 2026-11-16: "I have tasks and stuff assigned to me that only I am able to do, and then the task list here is
-- things we are moving to action". Migration 057 copied open to-dos onto the board and kept the to-dos, so most of his
-- list repeated board cards (todos.step_id names the card). Those copies are hidden here, never destroyed: each keeps
-- metadata.hidden = 'board-copy' with the time, and is brought back by
--   UPDATE todos SET deleted_at = NULL, metadata = metadata - 'hidden' - 'hiddenAt' WHERE metadata->>'hidden' = 'board-copy';
-- Only open to-dos whose card still exists are hidden; a to-do whose card was removed stays on his list.

UPDATE todos t
SET deleted_at = NOW(),
    metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('hidden', 'board-copy', 'hiddenAt', NOW()),
    updated_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.completed_at IS NULL
  AND t.step_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM project_steps s WHERE s.id = t.step_id AND s.deleted_at IS NULL);
