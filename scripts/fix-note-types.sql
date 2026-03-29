-- Fix: Expand progress_notes note_type check constraint
-- Current constraint only allows: 'progress', 'blocker', 'question', 'decision', 'completion'
-- New constraint adds: 'update', 'milestone'
-- Run against production Neon database

BEGIN;

-- Drop the existing check constraint on note_type
-- The constraint name is auto-generated; find and drop it dynamically
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'progress_notes'::regclass
    AND c.contype = 'c'
    AND a.attname = 'note_type';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE progress_notes DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  ELSE
    RAISE NOTICE 'No check constraint found on note_type column';
  END IF;
END $$;

-- Add the expanded check constraint
ALTER TABLE progress_notes
  ADD CONSTRAINT progress_notes_note_type_check
  CHECK (note_type IN ('progress', 'blocker', 'question', 'decision', 'completion', 'update', 'milestone'));

COMMIT;
