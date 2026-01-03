-- Migration 021: Add User Ownership to Existing Tables
-- Adds user_id column to projects and related tables

-- Add user_id to projects (nullable initially for existing data)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id to progress_notes
ALTER TABLE progress_notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id to execution_history
ALTER TABLE execution_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for user_id columns
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_notes_user_id ON progress_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_user_id ON execution_history(user_id);
