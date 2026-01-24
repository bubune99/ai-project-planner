-- ============================================================================
-- Migration 032: Ideas Incubator Enhancements
-- Adds tables from idea-incubator for consolidated database
-- ============================================================================

-- ============================================================================
-- Idea Transformations (track how ideas evolve)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_transformations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  to_idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  transformation_type VARCHAR(50) NOT NULL CHECK (
    transformation_type IN ('evolved_into', 'branched_as', 'merged_with', 'spawned')
  ),

  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_transformations_from ON idea_transformations(from_idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_transformations_to ON idea_transformations(to_idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_transformations_type ON idea_transformations(transformation_type);

-- ============================================================================
-- Idea Relationships (network connections between ideas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  to_idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  relationship_type VARCHAR(100) NOT NULL, -- 'depends_on', 'enables', 'similar_to', 'conflicts_with', etc.
  strength INTEGER DEFAULT 50 CHECK (strength >= 0 AND strength <= 100),

  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(from_idea_id, to_idea_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_idea_relationships_from ON idea_relationships(from_idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_relationships_to ON idea_relationships(to_idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_relationships_type ON idea_relationships(relationship_type);

-- ============================================================================
-- Categories (emergent taxonomy system)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES idea_categories(id) ON DELETE SET NULL,

  description TEXT,
  color VARCHAR(20),
  icon VARCHAR(50),

  usage_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_idea_categories_user ON idea_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_idea_categories_parent ON idea_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_idea_categories_slug ON idea_categories(slug);

-- ============================================================================
-- Idea Notes (freeform notes attached to ideas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  -- Optional context
  facet_id UUID REFERENCES idea_facets(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES idea_branches(id) ON DELETE SET NULL,
  perspective_id UUID REFERENCES idea_perspectives(id) ON DELETE SET NULL,

  -- Content
  title VARCHAR(255),
  content TEXT NOT NULL,
  note_type VARCHAR(50) DEFAULT 'general', -- 'general', 'question', 'insight', 'action', 'reference'

  -- Organization
  pinned BOOLEAN DEFAULT false,
  color VARCHAR(20),

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_notes_idea ON idea_notes(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_notes_facet ON idea_notes(facet_id);
CREATE INDEX IF NOT EXISTS idx_idea_notes_branch ON idea_notes(branch_id);
CREATE INDEX IF NOT EXISTS idx_idea_notes_pinned ON idea_notes(idea_id, pinned);

-- ============================================================================
-- Canvas Layers (depth/detail control)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_canvas_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  layer_number INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Visual properties
  color VARCHAR(20),
  opacity FLOAT DEFAULT 1.0 CHECK (opacity >= 0 AND opacity <= 1),

  -- Ordering
  display_order INTEGER NOT NULL DEFAULT 0,

  is_visible BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(idea_id, layer_number)
);

CREATE INDEX IF NOT EXISTS idx_idea_canvas_layers_idea ON idea_canvas_layers(idea_id);

-- ============================================================================
-- Canvas Snapshots (saved canvas states)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_canvas_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES idea_branches(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Complete canvas state
  snapshot_data JSONB NOT NULL,
  -- Expected: { nodes: [...], edges: [...], viewport: {...}, layers: [...] }

  -- Metadata
  thumbnail_url VARCHAR(500),

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_canvas_snapshots_idea ON idea_canvas_snapshots(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_snapshots_branch ON idea_canvas_snapshots(branch_id);

-- ============================================================================
-- Cross-Perspective Links (connect nodes across perspectives)
-- ============================================================================
CREATE TABLE IF NOT EXISTS idea_cross_perspective_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  source_node_id UUID NOT NULL REFERENCES idea_canvas_nodes(id) ON DELETE CASCADE,
  source_perspective_id UUID NOT NULL REFERENCES idea_perspectives(id) ON DELETE CASCADE,

  target_node_id UUID NOT NULL REFERENCES idea_canvas_nodes(id) ON DELETE CASCADE,
  target_perspective_id UUID NOT NULL REFERENCES idea_perspectives(id) ON DELETE CASCADE,

  link_type VARCHAR(50) NOT NULL DEFAULT 'related', -- 'related', 'depends', 'conflicts', 'supports'
  label VARCHAR(255),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_cross_perspective_links_idea ON idea_cross_perspective_links(idea_id);
CREATE INDEX IF NOT EXISTS idx_cross_perspective_links_source ON idea_cross_perspective_links(source_node_id);
CREATE INDEX IF NOT EXISTS idx_cross_perspective_links_target ON idea_cross_perspective_links(target_node_id);

-- ============================================================================
-- User Canvas Preferences (per-user display settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_canvas_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  -- Viewport state
  viewport JSONB DEFAULT '{"x": 0, "y": 0, "zoom": 1}',

  -- Active context
  active_branch_id UUID REFERENCES idea_branches(id) ON DELETE SET NULL,
  active_perspective_id UUID REFERENCES idea_perspectives(id) ON DELETE SET NULL,
  active_scenario_id UUID REFERENCES idea_scenarios(id) ON DELETE SET NULL,

  -- Layer visibility (layer_id -> boolean)
  layer_visibility JSONB DEFAULT '{}',

  -- UI preferences
  show_minimap BOOLEAN DEFAULT true,
  show_grid BOOLEAN DEFAULT true,
  snap_to_grid BOOLEAN DEFAULT true,
  grid_size INTEGER DEFAULT 20,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, idea_id)
);

CREATE INDEX IF NOT EXISTS idx_user_canvas_preferences_user ON user_canvas_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_canvas_preferences_idea ON user_canvas_preferences(idea_id);

-- ============================================================================
-- Add origin_idea_id to ideas table (for evolution tracking)
-- ============================================================================
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS origin_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ideas_origin ON ideas(origin_idea_id);

-- ============================================================================
-- Add layer_id to canvas nodes (for layer assignment)
-- ============================================================================
ALTER TABLE idea_canvas_nodes ADD COLUMN IF NOT EXISTS layer_id UUID REFERENCES idea_canvas_layers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_idea_canvas_nodes_layer ON idea_canvas_nodes(layer_id);

-- ============================================================================
-- Add perspective_id and scenario_id to canvas nodes
-- ============================================================================
ALTER TABLE idea_canvas_nodes ADD COLUMN IF NOT EXISTS perspective_id UUID REFERENCES idea_perspectives(id) ON DELETE SET NULL;
ALTER TABLE idea_canvas_nodes ADD COLUMN IF NOT EXISTS scenario_id UUID REFERENCES idea_scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_idea_canvas_nodes_perspective ON idea_canvas_nodes(perspective_id);
CREATE INDEX IF NOT EXISTS idx_idea_canvas_nodes_scenario ON idea_canvas_nodes(scenario_id);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_idea_categories_updated_at ON idea_categories;
CREATE TRIGGER update_idea_categories_updated_at
    BEFORE UPDATE ON idea_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_notes_updated_at ON idea_notes;
CREATE TRIGGER update_idea_notes_updated_at
    BEFORE UPDATE ON idea_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_idea_canvas_layers_updated_at ON idea_canvas_layers;
CREATE TRIGGER update_idea_canvas_layers_updated_at
    BEFORE UPDATE ON idea_canvas_layers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_canvas_preferences_updated_at ON user_canvas_preferences;
CREATE TRIGGER update_user_canvas_preferences_updated_at
    BEFORE UPDATE ON user_canvas_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Create default layers for a new idea
CREATE OR REPLACE FUNCTION create_default_idea_layers(p_idea_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO idea_canvas_layers (idea_id, layer_number, name, description, display_order)
  VALUES
    (p_idea_id, 0, 'Core', 'Essential elements and main concepts', 0),
    (p_idea_id, 1, 'Details', 'Supporting details and specifications', 1),
    (p_idea_id, 2, 'Connections', 'Relationships and dependencies', 2),
    (p_idea_id, 3, 'Notes', 'Annotations and commentary', 3)
  ON CONFLICT (idea_id, layer_number) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create default perspective for a new idea
CREATE OR REPLACE FUNCTION create_default_idea_perspective(p_idea_id UUID)
RETURNS UUID AS $$
DECLARE
  v_perspective_id UUID;
BEGIN
  INSERT INTO idea_perspectives (idea_id, name, description, is_default)
  VALUES (p_idea_id, 'Default', 'Default perspective for this idea', true)
  RETURNING id INTO v_perspective_id;

  RETURN v_perspective_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE idea_transformations IS 'Tracks how ideas evolve and transform over time';
COMMENT ON TABLE idea_relationships IS 'Network graph of connections between ideas';
COMMENT ON TABLE idea_categories IS 'User-defined category taxonomy for organizing ideas';
COMMENT ON TABLE idea_notes IS 'Freeform notes attached to ideas with optional context';
COMMENT ON TABLE idea_canvas_layers IS 'Depth/detail control layers for the canvas';
COMMENT ON TABLE idea_canvas_snapshots IS 'Saved states of the canvas for undo/versioning';
COMMENT ON TABLE idea_cross_perspective_links IS 'Links connecting nodes across different perspectives';
COMMENT ON TABLE user_canvas_preferences IS 'Per-user display and interaction preferences for each idea canvas';
