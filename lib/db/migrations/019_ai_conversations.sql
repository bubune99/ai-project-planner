-- Migration 019: AI Conversations
-- Creates tables for persistent AI chat conversations

-- AI Conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  title VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  context_type VARCHAR(50) CHECK (context_type IN ('project', 'task', 'document', 'general', 'planning', 'review')),
  context_id VARCHAR(255),
  model_id VARCHAR(100),
  message_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- AI Messages table
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  parts JSONB,
  attachments JSONB,
  tool_calls JSONB,
  tool_results JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for ai_conversations
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON ai_conversations(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_conversations_context ON ai_conversations(context_type, context_id) WHERE context_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

-- Indexes for ai_messages
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_role ON ai_messages(conversation_id, role);

-- Function to update conversation timestamp and message count
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_conversations
  SET updated_at = NOW(),
      message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation on new message
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON ai_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Comments
COMMENT ON TABLE ai_conversations IS 'Stores AI chat conversation sessions with context';
COMMENT ON TABLE ai_messages IS 'Stores individual messages within AI conversations';
COMMENT ON COLUMN ai_conversations.context_type IS 'Type of context: project, task, document, general, planning, review';
COMMENT ON COLUMN ai_conversations.context_id IS 'ID of the related entity (project_id, task_id, etc.)';
COMMENT ON COLUMN ai_messages.parts IS 'Structured message parts for multimodal content';
COMMENT ON COLUMN ai_messages.tool_calls IS 'AI tool invocations in this message';
COMMENT ON COLUMN ai_messages.tool_results IS 'Results from tool executions';
