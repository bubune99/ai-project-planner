-- Migration 022: Data Migration and User Constraints
-- Migrates existing data to system user and adds FK constraints

-- System user ID constant
-- This user owns all pre-existing data from before multi-tenancy
DO $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Migrate existing projects to system user
  UPDATE projects
  SET user_id = system_user_id
  WHERE user_id IS NULL;

  -- Migrate existing documents to system user
  UPDATE documents
  SET user_id = system_user_id
  WHERE user_id IS NULL;

  -- Migrate existing progress_notes to system user
  UPDATE progress_notes
  SET user_id = system_user_id
  WHERE user_id IS NULL;

  -- Migrate existing execution_history to system user
  UPDATE execution_history
  SET user_id = system_user_id
  WHERE user_id IS NULL;

  -- Migrate existing ai_conversations to system user
  -- Handle both NULL and the old default UUID
  UPDATE ai_conversations
  SET user_id = system_user_id
  WHERE user_id IS NULL
     OR user_id = '00000000-0000-0000-0000-000000000001';

  RAISE NOTICE 'Data migration to system user completed';
END $$;

-- Add NOT NULL constraints after data migration
ALTER TABLE projects
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE documents
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE progress_notes
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE execution_history
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE ai_conversations
ALTER COLUMN user_id SET NOT NULL;

-- Add foreign key constraints
ALTER TABLE projects
ADD CONSTRAINT fk_projects_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE documents
ADD CONSTRAINT fk_documents_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE progress_notes
ADD CONSTRAINT fk_progress_notes_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE execution_history
ADD CONSTRAINT fk_execution_history_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_conversations
ADD CONSTRAINT fk_ai_conversations_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes on user_id columns for efficient filtering
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_notes_user_id ON progress_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_user_id ON execution_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_user_project ON documents(user_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_progress_notes_user_project ON progress_notes(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_status ON ai_conversations(user_id, status);

-- Helper function to transfer system user data to a real user
-- Call this when a user signs up and wants to claim their existing data
CREATE OR REPLACE FUNCTION transfer_system_user_data(
  target_user_id UUID,
  transfer_all BOOLEAN DEFAULT false
) RETURNS TABLE(
  projects_transferred INTEGER,
  documents_transferred INTEGER,
  conversations_transferred INTEGER
) AS $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
  proj_count INTEGER;
  doc_count INTEGER;
  conv_count INTEGER;
BEGIN
  IF transfer_all THEN
    -- Transfer all system user data to the target user
    UPDATE projects SET user_id = target_user_id
    WHERE user_id = system_user_id;
    GET DIAGNOSTICS proj_count = ROW_COUNT;

    UPDATE documents SET user_id = target_user_id
    WHERE user_id = system_user_id;
    GET DIAGNOSTICS doc_count = ROW_COUNT;

    UPDATE ai_conversations SET user_id = target_user_id
    WHERE user_id = system_user_id;
    GET DIAGNOSTICS conv_count = ROW_COUNT;

    -- Also transfer related records
    UPDATE progress_notes SET user_id = target_user_id
    WHERE user_id = system_user_id;

    UPDATE execution_history SET user_id = target_user_id
    WHERE user_id = system_user_id;
  ELSE
    proj_count := 0;
    doc_count := 0;
    conv_count := 0;
  END IF;

  RETURN QUERY SELECT proj_count, doc_count, conv_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on the function
COMMENT ON FUNCTION transfer_system_user_data IS
'Transfers all data owned by the system user to a specified user.
Use when the first real user signs up and wants to claim existing data.';
