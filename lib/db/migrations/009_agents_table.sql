-- Migration 009: Agents Table
-- Creates table for tracking AI agent status and assignments

-- Create agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('v0', 'claude', 'gemini', 'gpt')),
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'working', 'error')) DEFAULT 'idle',
  current_task_id UUID REFERENCES project_steps(id) ON DELETE SET NULL,
  last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
  capabilities JSONB, -- What this agent is good at: {strengths: [], use_for: []}
  metadata JSONB, -- Additional configuration
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default agents with capabilities
INSERT INTO agents (name, status, capabilities) VALUES
  ('v0', 'idle', '{"strengths": ["UI/UX design", "React components", "Tailwind CSS", "Rapid prototyping"], "use_for": ["frontend", "component_creation", "ui_design"]}'::jsonb),
  ('claude', 'idle', '{"strengths": ["Code review", "Architecture planning", "Documentation", "Complex reasoning"], "use_for": ["backend", "architecture", "documentation", "code_review"]}'::jsonb),
  ('gemini', 'idle', '{"strengths": ["Multimodal analysis", "Long context", "Research", "Data processing"], "use_for": ["research", "documentation", "analysis"]}'::jsonb),
  ('gpt', 'idle', '{"strengths": ["Problem solving", "General development", "Orchestration", "Quick tasks"], "use_for": ["backend", "frontend", "orchestration", "quick_fixes"]}'::jsonb);

-- Create indexes for quick lookups
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_current_task ON agents(current_task_id) WHERE current_task_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE agents IS 'Tracks AI agent status and current assignments';
COMMENT ON COLUMN agents.capabilities IS 'What this agent is good at and when to use it';
COMMENT ON COLUMN agents.current_task_id IS 'The task this agent is currently working on';

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_agent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_updated_at();

-- Create function to assign task to agent
CREATE OR REPLACE FUNCTION assign_task_to_agent(p_task_id UUID, p_agent_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Get agent ID
  SELECT id INTO v_agent_id
  FROM agents
  WHERE name = p_agent_name;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Agent % not found', p_agent_name;
  END IF;

  -- Update agent's current task
  UPDATE agents
  SET
    current_task_id = p_task_id,
    status = 'working',
    last_active_at = NOW()
  WHERE id = v_agent_id;

  -- Update task's assigned agent
  UPDATE project_steps
  SET assigned_agent = p_agent_name
  WHERE id = p_task_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assign_task_to_agent IS 'Assigns a task to an agent and updates both records';

-- Create function to complete task for agent
CREATE OR REPLACE FUNCTION complete_task_for_agent(p_task_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Set agent back to idle
  UPDATE agents
  SET
    current_task_id = NULL,
    status = 'idle',
    last_active_at = NOW()
  WHERE current_task_id = p_task_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_task_for_agent IS 'Marks agent as idle when task is completed';
