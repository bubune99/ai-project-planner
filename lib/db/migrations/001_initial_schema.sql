-- Migration 001: Initial Schema
-- Creates core tables for AI Project Planner

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning', 'in-progress', 'completed', 'on-hold')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date TIMESTAMP,
  due_date TIMESTAMP,
  completed_date TIMESTAMP,
  github_repo_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Project steps table
CREATE TABLE project_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'completed', 'blocked')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  phase TEXT NOT NULL,
  stage TEXT NOT NULL,
  estimated_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
  actual_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Step dependencies table
CREATE TABLE step_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  depends_on_step_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('hard', 'soft')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT different_steps CHECK (step_id != depends_on_step_id),
  CONSTRAINT unique_dependency UNIQUE (step_id, depends_on_step_id)
);

-- Tech stack items table
CREATE TABLE tech_stack_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT,
  rationale TEXT NOT NULL,
  documentation_url TEXT,
  alternatives_considered JSONB,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Business context table
CREATE TABLE business_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  vision TEXT NOT NULL,
  target_market TEXT NOT NULL,
  primary_use_case TEXT NOT NULL,
  revenue_model TEXT NOT NULL,
  competitive_advantage TEXT NOT NULL,
  success_metrics JSONB,
  market_analysis JSONB,
  risk_assessment JSONB,
  stakeholders JSONB,
  budget_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Execution history table
CREATE TABLE execution_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_id UUID REFERENCES project_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'step_started',
    'step_completed',
    'blocker_identified',
    'status_changed',
    'ai_agent_action',
    'project_created',
    'project_updated'
  )),
  agent_type TEXT,
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Documents table (for future S3 integration)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  s3_key TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  category TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Add comments for documentation
COMMENT ON TABLE projects IS 'Core projects table storing project metadata and status';
COMMENT ON TABLE project_steps IS 'Individual steps/tasks within a project with dependency tracking';
COMMENT ON TABLE step_dependencies IS 'Defines dependencies between project steps';
COMMENT ON TABLE tech_stack_items IS 'Technology stack items with rationale and alternatives';
COMMENT ON TABLE business_context IS 'Business context and planning information for projects';
COMMENT ON TABLE execution_history IS 'Audit log of all project and step changes';
COMMENT ON TABLE documents IS 'Document metadata with S3 references';
