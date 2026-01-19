-- ============================================================================
-- Migration 027: Memory 5W+H System (JARVIS)
-- Cognitive memory architecture based on the Model Ledger Protocol
-- Agent: JARVIS-Core
-- ============================================================================

-- Decision episode status
DO $$ BEGIN
  CREATE TYPE decision_status AS ENUM ('active', 'resolved', 'revisit', 'deprecated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Change stability levels
DO $$ BEGIN
  CREATE TYPE stability_level AS ENUM ('stable', 'evolving', 'experimental');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- WHERE Layer: Project Structure & Navigation
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_where_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Folder/file structure snapshot
  folder_structure JSONB DEFAULT '{}',

  -- Architecture patterns detected
  architecture_patterns TEXT[] DEFAULT '{}',

  -- Key endpoints/entry points
  key_endpoints TEXT[] DEFAULT '{}',

  -- Style conventions
  style_conventions JSONB DEFAULT '{}',

  -- Config file locations
  config_locations JSONB DEFAULT '{}',

  -- Semantic zones (areas with specific purposes)
  semantic_zones JSONB DEFAULT '[]',
  -- Structure: [{zone: string, paths: string[], purpose: string}]

  -- Dependency graph
  dependency_graph JSONB DEFAULT '{}',

  -- Entry points for the application
  entry_points TEXT[] DEFAULT '{}',

  -- Abstraction layers
  abstraction_layers TEXT[] DEFAULT '{}',

  -- Compression level (1-5)
  compression_level INTEGER DEFAULT 1 CHECK (compression_level >= 1 AND compression_level <= 5),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHAT Layer: Entity Relationships & Module Dependencies
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_what_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- File/module identification
  file_path VARCHAR(500) NOT NULL,
  module_name VARCHAR(255),

  -- Imports and exports
  imports TEXT[] DEFAULT '{}',
  exports TEXT[] DEFAULT '{}',

  -- Contained definitions
  classes TEXT[] DEFAULT '{}',
  functions TEXT[] DEFAULT '{}',
  types TEXT[] DEFAULT '{}',

  -- Dependencies (other modules this depends on)
  dependencies TEXT[] DEFAULT '{}',

  -- Interface contracts
  interface_contracts JSONB DEFAULT '{}',

  -- Module responsibility (what it does)
  module_responsibility TEXT,

  -- Public API
  public_api TEXT[] DEFAULT '{}',

  -- Stability rating
  change_stability stability_level DEFAULT 'evolving',

  -- Compression level
  compression_level INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(project_id, file_path)
);

-- ============================================================================
-- HOW Layer: Implementation Details & Algorithms
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_how_implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- File/function identification
  file_path VARCHAR(500) NOT NULL,
  function_name VARCHAR(255),

  -- Parsed structure (AST-like)
  parsed_structure JSONB DEFAULT '{}',

  -- Complexity metrics
  complexity_metrics JSONB DEFAULT '{}',
  -- Structure: {cyclomaticComplexity: number, linesOfCode: number, dependencies: number}

  -- Algorithm patterns detected
  algorithm_patterns TEXT[] DEFAULT '{}',

  -- Performance characteristics
  performance_characteristics JSONB DEFAULT '{}',

  -- Edge cases handled
  edge_cases_handled TEXT[] DEFAULT '{}',

  -- Test coverage percentage
  test_coverage FLOAT,

  -- Optimization opportunities
  optimization_opportunities TEXT[] DEFAULT '{}',

  -- Compression level
  compression_level INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHY Layer: Decision Episodes
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_why_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,

  -- Decision identification
  title VARCHAR(255) NOT NULL,
  status decision_status NOT NULL DEFAULT 'active',

  -- Summary
  summary TEXT,

  -- Categorization
  tags TEXT[] DEFAULT '{}',
  domains TEXT[] DEFAULT '{}', -- 'architecture', 'technology', 'business', etc.

  -- Stakeholders involved
  stakeholders TEXT[] DEFAULT '{}',

  -- Drivers
  business_drivers TEXT[] DEFAULT '{}',
  technical_constraints TEXT[] DEFAULT '{}',

  -- Future considerations
  future_considerations TEXT[] DEFAULT '{}',

  -- Compression level
  compression_level INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHY Layer: Decision Nodes (tree structure for complex decisions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_why_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES mlp_why_decisions(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES mlp_why_nodes(id) ON DELETE CASCADE,

  -- Reasoning
  reasoning TEXT NOT NULL,

  -- Alternatives considered
  alternatives JSONB DEFAULT '[]',
  -- Structure: [{name: string, pros: string[], cons: string[]}]

  -- Constraints at this decision point
  constraints TEXT[] DEFAULT '{}',

  -- Confidence level (0-100)
  confidence_level INTEGER CHECK (confidence_level >= 0 AND confidence_level <= 100),

  -- When to revisit this decision
  revisit_triggers TEXT[] DEFAULT '{}',

  -- Impact assessment
  impact_assessment JSONB DEFAULT '{}',

  order_index INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHY Layer: Attempted Solutions (lessons learned)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_why_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES mlp_why_decisions(id) ON DELETE CASCADE,

  -- Problem description
  problem TEXT NOT NULL,

  -- What was tried
  approach_tried TEXT NOT NULL,

  -- How it failed
  failure_mode TEXT NOT NULL,

  -- Why it failed
  root_cause TEXT,

  -- What was learned
  lesson_learned TEXT NOT NULL,

  -- How to prevent in future
  prevention_strategy TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHY Layer: Solution Comparisons
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_why_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES mlp_why_decisions(id) ON DELETE CASCADE,

  -- Solutions being compared
  solution_a VARCHAR(255) NOT NULL,
  solution_b VARCHAR(255) NOT NULL,

  -- Comparison criteria and results
  criteria JSONB DEFAULT '[]',
  -- Structure: [{criterion: string, solution_a_score: number, solution_b_score: number, notes: string}]

  -- Winner (if determined)
  winner VARCHAR(255),
  winner_rationale TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHO Layer: Collaborators
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_who_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Collaborator identification
  name VARCHAR(255) NOT NULL,
  collaborator_type VARCHAR(50) NOT NULL CHECK (collaborator_type IN ('human', 'ai', 'team', 'service')),

  -- External reference (if linked to actual user)
  linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Expertise areas
  expertise TEXT[] DEFAULT '{}',

  -- Contact info
  contact_info JSONB DEFAULT '{}',

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHO Layer: Contributions
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_who_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES mlp_who_collaborators(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,

  -- Contribution details
  contribution_type VARCHAR(100) NOT NULL,
  description TEXT,

  -- Impact
  impact_level VARCHAR(20) CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHEN Layer: Temporal Events
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_when_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  description TEXT,

  -- Affected components
  affected_components TEXT[] DEFAULT '{}',

  -- Significance (0-100)
  significance_score INTEGER CHECK (significance_score >= 0 AND significance_score <= 100),

  -- Additional data
  event_data JSONB DEFAULT '{}',

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHEN Layer: Code Evolution
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_when_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- File identification
  file_path VARCHAR(500) NOT NULL,

  -- Version info
  version VARCHAR(50),
  commit_hash VARCHAR(64),

  -- Change type
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'modified', 'refactored', 'deleted')),

  -- Semantic diff
  semantic_diff JSONB DEFAULT '{}',

  -- Evolution patterns detected
  evolution_patterns TEXT[] DEFAULT '{}',

  -- Stability metrics over time
  stability_metrics JSONB DEFAULT '{}',

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WHEN Layer: Milestones
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_when_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,

  -- Milestone details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Type
  milestone_type VARCHAR(50) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'achieved', 'missed', 'cancelled')),

  -- Dates
  target_date DATE,
  achieved_date DATE,

  -- Impact
  impact TEXT,

  -- Associated deliverables
  deliverables JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Memory Compression Settings (per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mlp_compression_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Default compression level for each layer
  where_compression INTEGER DEFAULT 1,
  what_compression INTEGER DEFAULT 1,
  how_compression INTEGER DEFAULT 1,
  why_compression INTEGER DEFAULT 1,
  who_compression INTEGER DEFAULT 1,
  when_compression INTEGER DEFAULT 1,

  -- Token budget settings
  max_tokens_per_request INTEGER DEFAULT 4000,
  auto_compress BOOLEAN DEFAULT true,

  -- Retention settings (days, 0 = forever)
  retention_decisions INTEGER DEFAULT 0,
  retention_lessons INTEGER DEFAULT 0,
  retention_activity INTEGER DEFAULT 90,
  retention_conversations INTEGER DEFAULT 30,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- WHERE layer
CREATE INDEX IF NOT EXISTS idx_mlp_where_user ON mlp_where_structures(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_where_project ON mlp_where_structures(project_id);

-- WHAT layer
CREATE INDEX IF NOT EXISTS idx_mlp_what_user ON mlp_what_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_what_project ON mlp_what_modules(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_what_file ON mlp_what_modules(file_path);

-- HOW layer
CREATE INDEX IF NOT EXISTS idx_mlp_how_user ON mlp_how_implementations(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_how_project ON mlp_how_implementations(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_how_file ON mlp_how_implementations(file_path);

-- WHY layer - decisions
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_user ON mlp_why_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_project ON mlp_why_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_idea ON mlp_why_decisions(idea_id);
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_status ON mlp_why_decisions(status);
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_tags ON mlp_why_decisions USING GIN(tags);

-- WHY layer - nodes
CREATE INDEX IF NOT EXISTS idx_mlp_why_nodes_episode ON mlp_why_nodes(episode_id);
CREATE INDEX IF NOT EXISTS idx_mlp_why_nodes_parent ON mlp_why_nodes(parent_node_id);

-- WHY layer - attempts
CREATE INDEX IF NOT EXISTS idx_mlp_why_attempts_episode ON mlp_why_attempts(episode_id);

-- WHY layer - comparisons
CREATE INDEX IF NOT EXISTS idx_mlp_why_comparisons_episode ON mlp_why_comparisons(episode_id);

-- WHO layer
CREATE INDEX IF NOT EXISTS idx_mlp_who_collaborators_user ON mlp_who_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_who_collaborators_type ON mlp_who_collaborators(collaborator_type);
CREATE INDEX IF NOT EXISTS idx_mlp_who_contributions_collaborator ON mlp_who_contributions(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_mlp_who_contributions_project ON mlp_who_contributions(project_id);

-- WHEN layer
CREATE INDEX IF NOT EXISTS idx_mlp_when_events_user ON mlp_when_events(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_events_project ON mlp_when_events(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_events_timestamp ON mlp_when_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_mlp_when_events_type ON mlp_when_events(event_type);

CREATE INDEX IF NOT EXISTS idx_mlp_when_evolution_user ON mlp_when_evolution(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_evolution_project ON mlp_when_evolution(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_evolution_file ON mlp_when_evolution(file_path);

CREATE INDEX IF NOT EXISTS idx_mlp_when_milestones_user ON mlp_when_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_milestones_project ON mlp_when_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_mlp_when_milestones_status ON mlp_when_milestones(status);

-- ============================================================================
-- Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS update_mlp_where_updated_at ON mlp_where_structures;
CREATE TRIGGER update_mlp_where_updated_at
    BEFORE UPDATE ON mlp_where_structures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_what_updated_at ON mlp_what_modules;
CREATE TRIGGER update_mlp_what_updated_at
    BEFORE UPDATE ON mlp_what_modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_how_updated_at ON mlp_how_implementations;
CREATE TRIGGER update_mlp_how_updated_at
    BEFORE UPDATE ON mlp_how_implementations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_why_decisions_updated_at ON mlp_why_decisions;
CREATE TRIGGER update_mlp_why_decisions_updated_at
    BEFORE UPDATE ON mlp_why_decisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_why_nodes_updated_at ON mlp_why_nodes;
CREATE TRIGGER update_mlp_why_nodes_updated_at
    BEFORE UPDATE ON mlp_why_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_who_collaborators_updated_at ON mlp_who_collaborators;
CREATE TRIGGER update_mlp_who_collaborators_updated_at
    BEFORE UPDATE ON mlp_who_collaborators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_when_milestones_updated_at ON mlp_when_milestones;
CREATE TRIGGER update_mlp_when_milestones_updated_at
    BEFORE UPDATE ON mlp_when_milestones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mlp_compression_updated_at ON mlp_compression_settings;
CREATE TRIGGER update_mlp_compression_updated_at
    BEFORE UPDATE ON mlp_compression_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Full-text search for decisions
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_mlp_why_decisions_fts ON mlp_why_decisions
  USING GIN(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE mlp_where_structures IS 'WHERE layer: Project structure, navigation, semantic zones';
COMMENT ON TABLE mlp_what_modules IS 'WHAT layer: Module relationships, dependencies, interfaces';
COMMENT ON TABLE mlp_how_implementations IS 'HOW layer: Implementation details, algorithms, complexity';
COMMENT ON TABLE mlp_why_decisions IS 'WHY layer: Decision episodes - the reasoning behind choices';
COMMENT ON TABLE mlp_why_nodes IS 'WHY layer: Decision tree nodes for complex decisions';
COMMENT ON TABLE mlp_why_attempts IS 'WHY layer: Failed solutions and lessons learned';
COMMENT ON TABLE mlp_why_comparisons IS 'WHY layer: Side-by-side solution comparisons';
COMMENT ON TABLE mlp_who_collaborators IS 'WHO layer: People and agents involved';
COMMENT ON TABLE mlp_who_contributions IS 'WHO layer: Contribution history';
COMMENT ON TABLE mlp_when_events IS 'WHEN layer: Temporal events and timeline';
COMMENT ON TABLE mlp_when_evolution IS 'WHEN layer: Code evolution tracking';
COMMENT ON TABLE mlp_when_milestones IS 'WHEN layer: Project milestones';
COMMENT ON TABLE mlp_compression_settings IS 'Memory compression and retention settings per user';
