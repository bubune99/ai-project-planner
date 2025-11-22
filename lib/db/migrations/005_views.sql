-- Migration 005: Views
-- Creates database views optimized for UI components

-- View: Project Overview
-- Maps to ProjectOverview component
CREATE OR REPLACE VIEW project_overview AS
SELECT
  p.id,
  p.name,
  p.description,
  p.status,
  p.progress,
  p.priority,
  p.due_date,
  p.start_date,
  p.github_repo_url,
  (SELECT COUNT(*)
   FROM project_steps ps
   WHERE ps.project_id = p.id AND ps.deleted_at IS NULL) AS total_tasks,
  (SELECT COUNT(*)
   FROM project_steps ps
   WHERE ps.project_id = p.id
     AND ps.status = 'completed'
     AND ps.deleted_at IS NULL) AS completed_tasks,
  (SELECT ps.phase
   FROM project_steps ps
   WHERE ps.project_id = p.id
     AND ps.status = 'in-progress'
     AND ps.deleted_at IS NULL
   ORDER BY ps.order_index
   LIMIT 1) AS current_phase,
  (SELECT jsonb_agg(ts.name ORDER BY ts.order_index)
   FROM tech_stack_items ts
   WHERE ts.project_id = p.id AND ts.deleted_at IS NULL) AS tech_stack,
  (SELECT eh.created_at
   FROM execution_history eh
   WHERE eh.project_id = p.id
   ORDER BY eh.created_at DESC
   LIMIT 1) AS last_activity
FROM projects p
WHERE p.deleted_at IS NULL;

-- View: Project Execution
-- Maps to ProjectExecutionView component (Film Roll & Map views)
CREATE OR REPLACE VIEW project_execution AS
SELECT
  ps.id,
  ps.project_id,
  ps.title,
  ps.description,
  ps.status,
  ps.progress,
  ps.phase,
  ps.stage,
  ps.estimated_hours,
  ps.actual_hours,
  ps.can_work,
  ps.is_blocked,
  ps.should_work,
  ps.is_in_progress,
  ps.tasks,
  ps.order_index,
  (SELECT jsonb_agg(sd.depends_on_step_id)
   FROM step_dependencies sd
   WHERE sd.step_id = ps.id AND sd.deleted_at IS NULL) AS dependencies
FROM project_steps ps
WHERE ps.deleted_at IS NULL
ORDER BY ps.order_index;

-- View: Tech Stack Documentation
-- Maps to TechStackDocumentation component
CREATE OR REPLACE VIEW tech_stack_documentation AS
SELECT
  ts.id,
  ts.project_id,
  ts.name,
  ts.category,
  ts.version,
  ts.rationale,
  ts.documentation_url,
  ts.alternatives_considered,
  ts.order_index
FROM tech_stack_items ts
WHERE ts.deleted_at IS NULL
ORDER BY ts.order_index;

-- View: Project Dashboard Summary
-- Aggregated data for dashboard widgets
CREATE OR REPLACE VIEW project_dashboard_summary AS
SELECT
  p.id AS project_id,
  p.name,
  p.status,
  p.progress,
  p.priority,
  COUNT(ps.id) AS total_steps,
  COUNT(ps.id) FILTER (WHERE ps.status = 'completed') AS completed_steps,
  COUNT(ps.id) FILTER (WHERE ps.status = 'in-progress') AS in_progress_steps,
  COUNT(ps.id) FILTER (WHERE ps.is_blocked = true) AS blocked_steps,
  COUNT(ps.id) FILTER (WHERE ps.should_work = true) AS recommended_steps,
  SUM(ps.estimated_hours) AS total_estimated_hours,
  SUM(ps.actual_hours) AS total_actual_hours,
  SUM(ps.estimated_hours) FILTER (WHERE ps.status != 'completed') AS remaining_estimated_hours,
  CASE
    WHEN COUNT(ps.id) FILTER (WHERE ps.is_blocked = true) > 3 THEN 'high'
    WHEN COUNT(ps.id) FILTER (WHERE ps.is_blocked = true) > 0 THEN 'medium'
    ELSE 'low'
  END AS blocker_risk,
  CASE
    WHEN p.due_date IS NOT NULL AND p.due_date < NOW() AND p.status != 'completed' THEN true
    ELSE false
  END AS is_overdue,
  CASE
    WHEN p.due_date IS NOT NULL THEN
      EXTRACT(EPOCH FROM (p.due_date - NOW())) / 86400
    ELSE NULL
  END AS days_until_due
FROM projects p
LEFT JOIN project_steps ps ON ps.project_id = p.id AND ps.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.status, p.progress, p.priority, p.due_date;

-- View: Step Details with Dependencies
-- Detailed step information including dependency info
CREATE OR REPLACE VIEW step_details AS
SELECT
  ps.id,
  ps.project_id,
  ps.title,
  ps.description,
  ps.status,
  ps.progress,
  ps.phase,
  ps.stage,
  ps.estimated_hours,
  ps.actual_hours,
  ps.can_work,
  ps.is_blocked,
  ps.should_work,
  ps.is_in_progress,
  ps.tasks,
  ps.order_index,
  ps.created_at,
  ps.updated_at,
  ps.completed_at,
  (SELECT jsonb_agg(jsonb_build_object(
     'step_id', dep_ps.id,
     'title', dep_ps.title,
     'status', dep_ps.status,
     'progress', dep_ps.progress
   ))
   FROM step_dependencies sd
   JOIN project_steps dep_ps ON sd.depends_on_step_id = dep_ps.id
   WHERE sd.step_id = ps.id
     AND sd.deleted_at IS NULL
     AND dep_ps.deleted_at IS NULL) AS dependency_details,
  (SELECT jsonb_agg(jsonb_build_object(
     'step_id', blocked_ps.id,
     'title', blocked_ps.title,
     'status', blocked_ps.status
   ))
   FROM step_dependencies sd
   JOIN project_steps blocked_ps ON sd.step_id = blocked_ps.id
   WHERE sd.depends_on_step_id = ps.id
     AND sd.deleted_at IS NULL
     AND blocked_ps.deleted_at IS NULL) AS blocks_steps
FROM project_steps ps
WHERE ps.deleted_at IS NULL;

-- View: Recent Activity
-- Recent execution history for activity feeds
CREATE OR REPLACE VIEW recent_activity AS
SELECT
  eh.id,
  eh.project_id,
  p.name AS project_name,
  eh.step_id,
  ps.title AS step_title,
  eh.event_type,
  eh.agent_type,
  eh.description,
  eh.old_value,
  eh.new_value,
  eh.metadata,
  eh.created_at
FROM execution_history eh
JOIN projects p ON eh.project_id = p.id
LEFT JOIN project_steps ps ON eh.step_id = ps.id
ORDER BY eh.created_at DESC;

COMMENT ON VIEW project_overview IS 'Optimized view for ProjectOverview component';
COMMENT ON VIEW project_execution IS 'Optimized view for ProjectExecutionView component';
COMMENT ON VIEW tech_stack_documentation IS 'Optimized view for TechStackDocumentation component';
COMMENT ON VIEW project_dashboard_summary IS 'Aggregated data for dashboard widgets';
COMMENT ON VIEW step_details IS 'Detailed step information with dependency data';
COMMENT ON VIEW recent_activity IS 'Recent project activity for activity feeds';
