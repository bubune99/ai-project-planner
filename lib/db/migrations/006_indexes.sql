-- Migration 006: Indexes
-- Creates indexes for query performance optimization

-- Projects indexes
CREATE INDEX idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_priority ON projects(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_due_date ON projects(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX idx_projects_created_at ON projects(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

-- Project steps indexes
CREATE INDEX idx_project_steps_project_id ON project_steps(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_steps_project_order ON project_steps(project_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_steps_status ON project_steps(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_steps_should_work ON project_steps(project_id, should_work) WHERE should_work = true AND deleted_at IS NULL;
CREATE INDEX idx_project_steps_can_work ON project_steps(project_id, can_work) WHERE can_work = true AND deleted_at IS NULL;
CREATE INDEX idx_project_steps_is_blocked ON project_steps(project_id, is_blocked) WHERE is_blocked = true AND deleted_at IS NULL;
CREATE INDEX idx_project_steps_phase ON project_steps(project_id, phase) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_steps_deleted_at ON project_steps(deleted_at) WHERE deleted_at IS NOT NULL;

-- Step dependencies indexes
CREATE INDEX idx_step_dependencies_step_id ON step_dependencies(step_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_step_dependencies_depends_on ON step_dependencies(depends_on_step_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_step_dependencies_both ON step_dependencies(step_id, depends_on_step_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_step_dependencies_type ON step_dependencies(dependency_type) WHERE deleted_at IS NULL;

-- Tech stack items indexes
CREATE INDEX idx_tech_stack_items_project_id ON tech_stack_items(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tech_stack_items_project_order ON tech_stack_items(project_id, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_tech_stack_items_category ON tech_stack_items(project_id, category) WHERE deleted_at IS NULL;

-- Business context indexes
CREATE INDEX idx_business_context_project_id ON business_context(project_id);

-- Execution history indexes
CREATE INDEX idx_execution_history_project_id ON execution_history(project_id, created_at DESC);
CREATE INDEX idx_execution_history_step_id ON execution_history(step_id, created_at DESC) WHERE step_id IS NOT NULL;
CREATE INDEX idx_execution_history_event_type ON execution_history(event_type, created_at DESC);
CREATE INDEX idx_execution_history_agent_type ON execution_history(agent_type, created_at DESC) WHERE agent_type IS NOT NULL;
CREATE INDEX idx_execution_history_created_at ON execution_history(created_at DESC);

-- Documents indexes
CREATE INDEX idx_documents_project_id ON documents(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_category ON documents(project_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_created_at ON documents(created_at DESC) WHERE deleted_at IS NULL;

-- JSONB indexes for efficient querying
CREATE INDEX idx_projects_metadata ON projects USING GIN (metadata) WHERE metadata IS NOT NULL;
CREATE INDEX idx_project_steps_metadata ON project_steps USING GIN (metadata) WHERE metadata IS NOT NULL;
CREATE INDEX idx_project_steps_tasks ON project_steps USING GIN (tasks);
CREATE INDEX idx_tech_stack_alternatives ON tech_stack_items USING GIN (alternatives_considered) WHERE alternatives_considered IS NOT NULL;
CREATE INDEX idx_business_context_success_metrics ON business_context USING GIN (success_metrics) WHERE success_metrics IS NOT NULL;
CREATE INDEX idx_business_context_market_analysis ON business_context USING GIN (market_analysis) WHERE market_analysis IS NOT NULL;
CREATE INDEX idx_execution_history_metadata ON execution_history USING GIN (metadata) WHERE metadata IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX idx_steps_project_status_order ON project_steps(project_id, status, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_steps_work_priority ON project_steps(project_id, should_work, order_index) WHERE deleted_at IS NULL;

-- Full-text search indexes (for future search functionality)
CREATE INDEX idx_projects_search ON projects USING GIN (
  to_tsvector('english', name || ' ' || description)
) WHERE deleted_at IS NULL;

CREATE INDEX idx_steps_search ON project_steps USING GIN (
  to_tsvector('english', title || ' ' || description)
) WHERE deleted_at IS NULL;

-- Statistics for query planner
ANALYZE projects;
ANALYZE project_steps;
ANALYZE step_dependencies;
ANALYZE tech_stack_items;
ANALYZE business_context;
ANALYZE execution_history;
ANALYZE documents;

COMMENT ON INDEX idx_projects_status IS 'Query projects by status';
COMMENT ON INDEX idx_project_steps_project_order IS 'Efficient step ordering within projects';
COMMENT ON INDEX idx_project_steps_should_work IS 'Find recommended next steps';
COMMENT ON INDEX idx_step_dependencies_both IS 'Dependency graph queries';
COMMENT ON INDEX idx_execution_history_project_id IS 'Project activity timeline';
COMMENT ON INDEX idx_projects_search IS 'Full-text search on projects';
COMMENT ON INDEX idx_steps_search IS 'Full-text search on steps';
