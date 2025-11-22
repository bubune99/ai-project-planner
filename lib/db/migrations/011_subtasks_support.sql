-- Migration 011: Subtasks Support
-- Adds hierarchical task support for Kanban cards with subtasks

-- Add parent_task_id for hierarchical tasks
ALTER TABLE project_steps
  ADD COLUMN parent_task_id UUID REFERENCES project_steps(id) ON DELETE CASCADE;

-- Add subtask completion tracking
ALTER TABLE project_steps
  ADD COLUMN is_subtask BOOLEAN GENERATED ALWAYS AS (parent_task_id IS NOT NULL) STORED;

-- Create index for parent task lookups
CREATE INDEX idx_project_steps_parent ON project_steps(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- Create index for subtask queries
CREATE INDEX idx_project_steps_is_subtask ON project_steps(is_subtask) WHERE is_subtask = TRUE;

-- Add comments
COMMENT ON COLUMN project_steps.parent_task_id IS 'Parent task for subtasks (enables hierarchical task structure for Kanban)';
COMMENT ON COLUMN project_steps.is_subtask IS 'Computed: true if this is a subtask of another task';

-- Create function to get subtasks for a task
CREATE OR REPLACE FUNCTION get_subtasks(p_task_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  status TEXT,
  progress INTEGER,
  assigned_agent TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id,
    ps.title,
    ps.status::TEXT,
    ps.progress,
    ps.assigned_agent
  FROM project_steps ps
  WHERE ps.parent_task_id = p_task_id
    AND ps.deleted_at IS NULL
  ORDER BY ps.order_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_subtasks IS 'Returns all subtasks for a given parent task';

-- Create function to calculate parent task progress from subtasks
CREATE OR REPLACE FUNCTION update_parent_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id UUID;
  v_avg_progress DECIMAL;
  v_all_completed BOOLEAN;
BEGIN
  -- Only process if this is a subtask
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_parent_id := NEW.parent_task_id;

  -- Calculate average progress of all subtasks
  SELECT
    AVG(progress)::INTEGER,
    BOOL_AND(status = 'completed')
  INTO v_avg_progress, v_all_completed
  FROM project_steps
  WHERE parent_task_id = v_parent_id
    AND deleted_at IS NULL;

  -- Update parent task
  UPDATE project_steps
  SET
    progress = COALESCE(v_avg_progress, 0),
    status = CASE
      WHEN v_all_completed THEN 'completed'
      WHEN v_avg_progress > 0 THEN 'in-progress'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_parent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update parent progress
CREATE TRIGGER update_parent_progress_trigger
  AFTER INSERT OR UPDATE OF progress, status
  ON project_steps
  FOR EACH ROW
  WHEN (NEW.parent_task_id IS NOT NULL)
  EXECUTE FUNCTION update_parent_progress();

COMMENT ON TRIGGER update_parent_progress_trigger ON project_steps IS 'Automatically updates parent task progress based on subtasks';

-- Create function to get task hierarchy
CREATE OR REPLACE FUNCTION get_task_hierarchy(p_task_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  level INTEGER,
  path TEXT[]
) AS $$
WITH RECURSIVE task_tree AS (
  -- Base case: the requested task
  SELECT
    id,
    title,
    parent_task_id,
    0 as level,
    ARRAY[id::TEXT] as path
  FROM project_steps
  WHERE id = p_task_id AND deleted_at IS NULL

  UNION ALL

  -- Recursive case: subtasks
  SELECT
    ps.id,
    ps.title,
    ps.parent_task_id,
    tt.level + 1,
    tt.path || ps.id::TEXT
  FROM project_steps ps
  JOIN task_tree tt ON ps.parent_task_id = tt.id
  WHERE ps.deleted_at IS NULL
)
SELECT id, title, level, path
FROM task_tree
ORDER BY path;
$$ LANGUAGE SQL;

COMMENT ON FUNCTION get_task_hierarchy IS 'Returns task and all its subtasks in a hierarchical structure';

-- Add constraint to prevent circular references
ALTER TABLE project_steps
  ADD CONSTRAINT no_circular_parent CHECK (id != parent_task_id);

-- Add constraint to prevent deep nesting (max 3 levels)
CREATE OR REPLACE FUNCTION check_subtask_depth()
RETURNS TRIGGER AS $$
DECLARE
  v_depth INTEGER := 0;
  v_current_parent UUID;
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_current_parent := NEW.parent_task_id;

  -- Traverse up the hierarchy
  WHILE v_current_parent IS NOT NULL AND v_depth < 4 LOOP
    v_depth := v_depth + 1;

    SELECT parent_task_id INTO v_current_parent
    FROM project_steps
    WHERE id = v_current_parent;
  END LOOP;

  IF v_depth >= 3 THEN
    RAISE EXCEPTION 'Maximum subtask depth of 3 levels exceeded';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_subtask_depth_trigger
  BEFORE INSERT OR UPDATE OF parent_task_id
  ON project_steps
  FOR EACH ROW
  WHEN (NEW.parent_task_id IS NOT NULL)
  EXECUTE FUNCTION check_subtask_depth();

COMMENT ON TRIGGER check_subtask_depth_trigger ON project_steps IS 'Prevents subtask nesting deeper than 3 levels';
