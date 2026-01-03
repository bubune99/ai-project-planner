-- Migration 021: Add user_id to Existing Tables
-- Adds user ownership to all relevant tables for multi-tenancy

-- Add user_id to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add user_id to documents table (it has uploaded_by as TEXT, we need proper FK)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add user_id to progress_notes table
ALTER TABLE progress_notes
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add user_id to execution_history table
ALTER TABLE execution_history
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Note: ai_conversations already has user_id but no FK constraint
-- We'll add the FK in migration 022 after data migration
