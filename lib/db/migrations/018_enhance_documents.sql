-- Migration 018: Enhance Documents Table
-- Adds columns for Knowledge Base functionality

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index for category search
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
