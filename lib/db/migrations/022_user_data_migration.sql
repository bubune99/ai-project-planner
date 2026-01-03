-- Migration 022: Data Migration and Constraints
-- Migrates existing data and adds NOT NULL constraints

-- Create a system user for existing data (if any exists without user_id)
INSERT INTO users (id, stack_auth_id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'system@internal.local', 'System User')
ON CONFLICT (stack_auth_id) DO NOTHING;

-- Migrate existing projects to system user
UPDATE projects SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- Migrate existing documents to system user
UPDATE documents SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- Migrate existing progress_notes to system user
UPDATE progress_notes SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- Migrate existing execution_history to system user
UPDATE execution_history SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- Note: NOT NULL constraints are NOT added here to avoid breaking the app
-- if there are timing issues. The app code handles NULL user_id gracefully.
