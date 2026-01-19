-- ============================================================================
-- Migration 030: Todos Cross-Domain Linking (JARVIS)
-- Part of the JARVIS Personal Assistant Platform
-- Agent: JARVIS-API (Agent 4)
-- ============================================================================
-- Adds support for linking todos to Ideas and Finance Transactions
-- in addition to the existing project linking capability.

-- ============================================================================
-- Add new columns to todos table
-- ============================================================================

-- Add idea_id column (link to ideas table)
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL;

-- Add transaction_id column (link to finance_transactions table)
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES finance_transactions(id) ON DELETE SET NULL;

-- ============================================================================
-- Indexes for efficient queries
-- ============================================================================

-- Index for idea-linked todos
CREATE INDEX IF NOT EXISTS idx_todos_idea_id
  ON todos(idea_id) WHERE deleted_at IS NULL AND idea_id IS NOT NULL;

-- Index for transaction-linked todos
CREATE INDEX IF NOT EXISTS idx_todos_transaction_id
  ON todos(transaction_id) WHERE deleted_at IS NULL AND transaction_id IS NOT NULL;

-- Composite index for cross-domain queries (user + any domain link)
CREATE INDEX IF NOT EXISTS idx_todos_user_cross_domain
  ON todos(user_id, project_id, idea_id, transaction_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON COLUMN todos.idea_id IS 'Optional link to an idea (cross-domain linking)';
COMMENT ON COLUMN todos.transaction_id IS 'Optional link to a finance transaction (cross-domain linking)';
