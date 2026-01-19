-- ============================================================================
-- Migration 026: Ideas Module (JARVIS)
-- Part of the JARVIS Personal Assistant Platform
-- Agent: JARVIS-Core
-- ============================================================================

-- Ideas lifecycle state enum
DO $$ BEGIN
  CREATE TYPE idea_lifecycle AS ENUM ('seed', 'exploring', 'refined', 'promoted', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Facet types enum
DO $$ BEGIN
  CREATE TYPE facet_type AS ENUM (
    'pros_cons',
    'timeline',
    'market_research',
    'technical_specs',
    'financials',
    'dependencies',
    'risks',
    'alternatives',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Validation agent types
DO $$ BEGIN
  CREATE TYPE validation_agent_type AS ENUM ('business', 'technical', 'product', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Validation status
DO $$ BEGIN
  CREATE TYPE validation_status AS ENUM ('active', 'completed', 'paused', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Refinement types (feedback from execution)
DO $$ BEGIN
  CREATE TYPE refinement_type AS ENUM ('barrier_found', 'new_approach', 'pivot_needed', 'enhancement', 'feedback');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Refinement status
DO $$ BEGIN
  CREATE TYPE refinement_status AS ENUM ('open', 'accepted', 'rejected', 'merged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Core Ideas Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',

  -- Lifecycle
  lifecycle idea_lifecycle NOT NULL DEFAULT 'seed',

  -- Project linking (when promoted)
  promoted_to_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,

  -- Visibility
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),

  -- Canvas settings
  canvas_settings JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- Idea Branches (Git-like branching for ideas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  parent_branch_id UUID REFERENCES idea_branches(id) ON DELETE SET NULL,

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_main BOOLEAN NOT NULL DEFAULT false,

  -- Snapshot of canvas state at branch point
  snapshot JSONB DEFAULT '{}',

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merged_at TIMESTAMPTZ,
  merged_into_branch_id UUID REFERENCES idea_branches(id) ON DELETE SET NULL,

  UNIQUE(idea_id, name)
);

-- ============================================================================
-- Perspectives (Business, Technical, User, Investor views)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_perspectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner VARCHAR(100), -- who this perspective represents
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Settings for this perspective
  settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(idea_id, name)
);

-- ============================================================================
-- Scenarios (Bootstrap, Funded, Enterprise constraints)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  perspective_id UUID REFERENCES idea_perspectives(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,

  -- Constraints for this scenario
  constraints JSONB DEFAULT '{}'::JSONB,
  -- Expected structure:
  -- {
  --   "budget": number | null,
  --   "timeline": string | null,
  --   "team": number | null,
  --   "market": string | null,
  --   "technical": string[] | null
  -- }

  is_active BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Idea Facets (Analysis modules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_facets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES idea_branches(id) ON DELETE CASCADE,

  facet_type facet_type NOT NULL,
  name VARCHAR(100), -- custom name override

  -- Facet data (structure depends on facet_type)
  data JSONB NOT NULL DEFAULT '{}',

  -- Canvas position
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,

  -- Ordering
  order_index INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Canvas Nodes (for ReactFlow visualization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_canvas_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES idea_branches(id) ON DELETE CASCADE,

  -- Node type: 'idea', 'facet', 'validation', 'content'
  node_type VARCHAR(50) NOT NULL,

  -- Reference to related entity (facet_id, validation_id, etc.)
  reference_id UUID,
  reference_type VARCHAR(50),

  -- Position on canvas
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,

  -- Dimensions
  width FLOAT,
  height FLOAT,

  -- Visual styling
  style JSONB DEFAULT '{}',

  -- Content (for content nodes)
  content JSONB DEFAULT '{}',

  -- Layer visibility
  layer VARCHAR(50) DEFAULT 'core',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Canvas Edges (connections between nodes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES idea_branches(id) ON DELETE CASCADE,

  source_node_id UUID NOT NULL REFERENCES idea_canvas_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES idea_canvas_nodes(id) ON DELETE CASCADE,

  -- Edge type: 'dependency', 'relation', 'derivation'
  edge_type VARCHAR(50) NOT NULL DEFAULT 'relation',

  -- Label
  label VARCHAR(255),

  -- Visual styling
  style JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Validation Sessions (AI agent validation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  agent_type validation_agent_type NOT NULL,
  status validation_status NOT NULL DEFAULT 'active',

  -- Conversation
  messages JSONB NOT NULL DEFAULT '[]',
  -- Expected structure: [{role: 'user'|'assistant', content: string, timestamp: ISO8601}]

  -- Current focus
  current_facet_id UUID REFERENCES idea_facets(id) ON DELETE SET NULL,
  validated_facet_ids UUID[] DEFAULT '{}',

  -- Validation results
  validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),
  blockers TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',

  -- Custom agent config (for 'custom' agent_type)
  agent_config JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- Refinements (feedback from project execution back to idea)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_refinements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  source_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  refinement_type refinement_type NOT NULL,
  status refinement_status NOT NULL DEFAULT 'open',

  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Proposed changes to the idea
  proposed_changes JSONB DEFAULT '{}',

  -- Discussion
  comments JSONB DEFAULT '[]',
  -- Expected structure: [{author: string, content: string, timestamp: ISO8601}]

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Generated Documents (business plans, PRDs, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  -- Document type: 'business_plan', 'prd', 'pitch_deck', 'tech_spec', 'executive_summary'
  document_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,

  -- Content
  content TEXT,
  content_format VARCHAR(20) DEFAULT 'markdown', -- 'markdown', 'html', 'json'

  -- Generation info
  generated_from_facets UUID[] DEFAULT '{}',
  generation_prompt TEXT,

  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES idea_documents(id) ON DELETE SET NULL,

  -- Storage (for larger documents)
  blob_key VARCHAR(500),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Ideas
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_lifecycle ON ideas(lifecycle);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_promoted_project ON ideas(promoted_to_project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_deleted_at ON ideas(deleted_at);

-- Branches
CREATE INDEX IF NOT EXISTS idx_idea_branches_idea_id ON idea_branches(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_branches_active ON idea_branches(idea_id, is_active);

-- Perspectives & Scenarios
CREATE INDEX IF NOT EXISTS idx_idea_perspectives_idea_id ON idea_perspectives(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_scenarios_idea_id ON idea_scenarios(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_scenarios_perspective ON idea_scenarios(perspective_id);

-- Facets
CREATE INDEX IF NOT EXISTS idx_idea_facets_idea_id ON idea_facets(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_facets_branch_id ON idea_facets(branch_id);
CREATE INDEX IF NOT EXISTS idx_idea_facets_type ON idea_facets(facet_type);

-- Canvas nodes and edges
CREATE INDEX IF NOT EXISTS idx_idea_canvas_nodes_idea ON idea_canvas_nodes(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_nodes_branch ON idea_canvas_nodes(branch_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_edges_idea ON idea_canvas_edges(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_edges_source ON idea_canvas_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_edges_target ON idea_canvas_edges(target_node_id);

-- Validations
CREATE INDEX IF NOT EXISTS idx_idea_validations_idea_id ON idea_validations(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_validations_status ON idea_validations(status);

-- Refinements
CREATE INDEX IF NOT EXISTS idx_idea_refinements_idea_id ON idea_refinements(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_refinements_project ON idea_refinements(source_project_id);
CREATE INDEX IF NOT EXISTS idx_idea_refinements_status ON idea_refinements(status);

-- Documents
CREATE INDEX IF NOT EXISTS idx_idea_documents_idea_id ON idea_documents(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_documents_type ON idea_documents(document_type);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
CREATE TRIGGER update_ideas_updated_at
    BEFORE UPDATE ON ideas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_branches_updated_at ON idea_branches;
CREATE TRIGGER update_idea_branches_updated_at
    BEFORE UPDATE ON idea_branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_perspectives_updated_at ON idea_perspectives;
CREATE TRIGGER update_idea_perspectives_updated_at
    BEFORE UPDATE ON idea_perspectives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_scenarios_updated_at ON idea_scenarios;
CREATE TRIGGER update_idea_scenarios_updated_at
    BEFORE UPDATE ON idea_scenarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_facets_updated_at ON idea_facets;
CREATE TRIGGER update_idea_facets_updated_at
    BEFORE UPDATE ON idea_facets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_canvas_nodes_updated_at ON idea_canvas_nodes;
CREATE TRIGGER update_idea_canvas_nodes_updated_at
    BEFORE UPDATE ON idea_canvas_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_validations_updated_at ON idea_validations;
CREATE TRIGGER update_idea_validations_updated_at
    BEFORE UPDATE ON idea_validations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_refinements_updated_at ON idea_refinements;
CREATE TRIGGER update_idea_refinements_updated_at
    BEFORE UPDATE ON idea_refinements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_documents_updated_at ON idea_documents;
CREATE TRIGGER update_idea_documents_updated_at
    BEFORE UPDATE ON idea_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE ideas IS 'Core ideas table for the Ideas module - stores main idea records';
COMMENT ON TABLE idea_branches IS 'Git-like branching for ideas - allows exploring different directions';
COMMENT ON TABLE idea_perspectives IS 'Different viewpoints for analyzing an idea (Business, Technical, etc.)';
COMMENT ON TABLE idea_scenarios IS 'Constraint scenarios for each perspective (Bootstrap, Funded, etc.)';
COMMENT ON TABLE idea_facets IS 'Analysis modules attached to ideas (pros/cons, market research, etc.)';
COMMENT ON TABLE idea_canvas_nodes IS 'Visual nodes for the ReactFlow canvas';
COMMENT ON TABLE idea_canvas_edges IS 'Connections between canvas nodes';
COMMENT ON TABLE idea_validations IS 'AI agent validation sessions for ideas';
COMMENT ON TABLE idea_refinements IS 'Feedback from project execution back to the original idea';
COMMENT ON TABLE idea_documents IS 'Generated documents (business plans, PRDs, etc.) from ideas';
