-- Migration 015: Project Phases & Architecture Decision Records
-- Tracks project lifecycle phases and architecture decisions/pivots

-- Create project phases table for phase history tracking
CREATE TABLE project_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL CHECK (phase_name IN ('ideation', 'architecture', 'construction', 'testing', 'deployment', 'maintenance')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'skipped')) DEFAULT 'active',
  description TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  completed_by TEXT, -- Who marked it complete (human or agent name)
  exit_criteria JSONB DEFAULT '[]'::jsonb, -- [{criterion: "Architecture doc approved", met: true}]
  deliverables JSONB DEFAULT '[]'::jsonb, -- [{deliverable: "Technical design doc", completed: true, link: "doc_id"}]
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create architecture decision records (ADR) table
CREATE TABLE architecture_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded', 'deprecated')) DEFAULT 'proposed',
  context TEXT NOT NULL, -- Why we're making this decision
  decision TEXT NOT NULL, -- What we decided
  consequences TEXT, -- Implications of this decision
  alternatives JSONB DEFAULT '[]'::jsonb, -- [{option: "Use PostgreSQL", pros: [], cons: [], reason_not_chosen: ""}]
  supersedes_adr_id UUID REFERENCES architecture_decisions(id) ON DELETE SET NULL, -- If this replaces a previous ADR
  superseded_by_adr_id UUID REFERENCES architecture_decisions(id) ON DELETE SET NULL, -- If this was replaced
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- ["database", "backend", "security"]
  decided_by TEXT, -- Who made the decision
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create table for linking ADRs to project steps
CREATE TABLE adr_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adr_id UUID NOT NULL REFERENCES architecture_decisions(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES project_steps(id) ON DELETE CASCADE,
  relationship_type TEXT CHECK (relationship_type IN ('implements', 'affected_by', 'blocked_by')) DEFAULT 'implements',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(adr_id, step_id)
);

-- Create indexes
CREATE INDEX idx_project_phases_project ON project_phases(project_id, started_at DESC);
CREATE INDEX idx_project_phases_status ON project_phases(status);
CREATE INDEX idx_architecture_decisions_project ON architecture_decisions(project_id, created_at DESC);
CREATE INDEX idx_architecture_decisions_status ON architecture_decisions(status);
CREATE INDEX idx_architecture_decisions_tags ON architecture_decisions USING GIN(tags);
CREATE INDEX idx_adr_steps_adr ON adr_steps(adr_id);
CREATE INDEX idx_adr_steps_step ON adr_steps(step_id);

-- Add comments
COMMENT ON TABLE project_phases IS 'Track project lifecycle phases: ideation → architecture → construction → testing → deployment';
COMMENT ON COLUMN project_phases.phase_name IS 'Current phase of the project';
COMMENT ON COLUMN project_phases.exit_criteria IS 'Criteria that must be met to exit this phase';
COMMENT ON COLUMN project_phases.deliverables IS 'Key deliverables for this phase';

COMMENT ON TABLE architecture_decisions IS 'Architecture Decision Records (ADR) - Track all architectural decisions and pivots';
COMMENT ON COLUMN architecture_decisions.status IS 'proposed = under consideration, accepted = in use, superseded = replaced by newer decision';
COMMENT ON COLUMN architecture_decisions.supersedes_adr_id IS 'If this decision replaces a previous one (architecture pivot)';
COMMENT ON COLUMN architecture_decisions.alternatives IS 'Other options considered with pros/cons';

COMMENT ON TABLE adr_steps IS 'Links architecture decisions to the steps that implement or are affected by them';

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_phase_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_phases_updated_at
  BEFORE UPDATE ON project_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_phase_updated_at();

CREATE TRIGGER architecture_decisions_updated_at
  BEFORE UPDATE ON architecture_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_phase_updated_at();

-- Create function to get current active phase
CREATE OR REPLACE FUNCTION get_current_phase(p_project_id UUID)
RETURNS TABLE(
  phase_id UUID,
  phase_name TEXT,
  started_at TIMESTAMP,
  days_in_phase INTEGER,
  exit_criteria JSONB,
  deliverables JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.phase_name::TEXT,
    pp.started_at,
    EXTRACT(DAY FROM NOW() - pp.started_at)::INTEGER as days_in_phase,
    pp.exit_criteria,
    pp.deliverables
  FROM project_phases pp
  WHERE pp.project_id = p_project_id
    AND pp.status = 'active'
  ORDER BY pp.started_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_current_phase IS 'Get the current active phase for a project';

-- Create function to transition to next phase
CREATE OR REPLACE FUNCTION transition_to_phase(
  p_project_id UUID,
  p_new_phase TEXT,
  p_completed_by TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  new_phase_id UUID
) AS $$
DECLARE
  v_current_phase_id UUID;
  v_new_phase_id UUID;
BEGIN
  -- Mark current phase as completed
  UPDATE project_phases
  SET
    status = 'completed',
    completed_at = NOW(),
    completed_by = p_completed_by,
    updated_at = NOW()
  WHERE project_id = p_project_id
    AND status = 'active'
  RETURNING id INTO v_current_phase_id;

  -- Create new phase
  INSERT INTO project_phases (
    project_id,
    phase_name,
    status,
    description,
    started_at
  ) VALUES (
    p_project_id,
    p_new_phase,
    'active',
    p_description,
    NOW()
  )
  RETURNING id INTO v_new_phase_id;

  -- Update project's current_phase field
  UPDATE projects
  SET
    current_phase = p_new_phase,
    updated_at = NOW()
  WHERE id = p_project_id;

  -- Log to execution history
  INSERT INTO execution_history (
    project_id,
    event_type,
    description,
    new_value
  ) VALUES (
    p_project_id,
    'phase_transition',
    'Project transitioned to ' || p_new_phase || ' phase',
    jsonb_build_object('new_phase', p_new_phase, 'completed_by', p_completed_by)
  );

  RETURN QUERY SELECT TRUE, 'Phase transition successful', v_new_phase_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION transition_to_phase IS 'Complete current phase and transition to next phase';

-- Create function to get all ADRs for a project
CREATE OR REPLACE FUNCTION get_project_adrs(p_project_id UUID, p_status TEXT DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  title TEXT,
  status TEXT,
  context TEXT,
  decision TEXT,
  consequences TEXT,
  alternatives JSONB,
  tags TEXT[],
  decided_by TEXT,
  decided_at TIMESTAMP,
  supersedes_title TEXT,
  superseded_by_title TEXT,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ad.id,
    ad.title,
    ad.status::TEXT,
    ad.context,
    ad.decision,
    ad.consequences,
    ad.alternatives,
    ad.tags,
    ad.decided_by,
    ad.decided_at,
    sup.title as supersedes_title,
    sup_by.title as superseded_by_title,
    ad.created_at
  FROM architecture_decisions ad
  LEFT JOIN architecture_decisions sup ON ad.supersedes_adr_id = sup.id
  LEFT JOIN architecture_decisions sup_by ON ad.superseded_by_adr_id = sup_by.id
  WHERE ad.project_id = p_project_id
    AND (p_status IS NULL OR ad.status = p_status)
  ORDER BY ad.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_project_adrs IS 'Get all architecture decision records for a project with supersede relationships';

-- Create function to supersede (replace) an ADR
CREATE OR REPLACE FUNCTION supersede_adr(
  p_old_adr_id UUID,
  p_new_adr_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mark old ADR as superseded
  UPDATE architecture_decisions
  SET
    status = 'superseded',
    superseded_by_adr_id = p_new_adr_id,
    updated_at = NOW()
  WHERE id = p_old_adr_id;

  -- Link new ADR to old one
  UPDATE architecture_decisions
  SET
    supersedes_adr_id = p_old_adr_id,
    updated_at = NOW()
  WHERE id = p_new_adr_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION supersede_adr IS 'Mark an ADR as superseded by a new one (for architecture pivots)';

-- Create view for phase progression overview
CREATE OR REPLACE VIEW project_phase_overview AS
SELECT
  p.id as project_id,
  p.name as project_name,
  p.current_phase,
  pp.phase_name,
  pp.status as phase_status,
  pp.started_at,
  pp.completed_at,
  EXTRACT(DAY FROM COALESCE(pp.completed_at, NOW()) - pp.started_at)::INTEGER as days_in_phase,
  (
    SELECT COUNT(*)
    FROM architecture_decisions ad
    WHERE ad.project_id = p.id AND ad.status = 'accepted'
  ) as active_adrs,
  (
    SELECT COUNT(*)
    FROM architecture_decisions ad
    WHERE ad.project_id = p.id AND ad.status = 'superseded'
  ) as superseded_adrs
FROM projects p
LEFT JOIN project_phases pp ON p.id = pp.project_id AND pp.status = 'active';

COMMENT ON VIEW project_phase_overview IS 'Overview of current project phases and ADR counts';
