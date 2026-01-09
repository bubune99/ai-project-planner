-- Migration 023: Workspace Binding for MCP
-- Enables GitHub-style project context resolution
-- Agents can register workspaces and set active projects

-- Add workspace_path to projects (git remote already exists as github_repo_url)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_path TEXT;

-- Add active project binding to API keys (persists across sessions)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS active_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for workspace lookups (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_projects_workspace_path
ON projects(workspace_path)
WHERE workspace_path IS NOT NULL AND deleted_at IS NULL;

-- Index for git remote lookups (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_projects_github_repo_url
ON projects(github_repo_url)
WHERE github_repo_url IS NOT NULL AND deleted_at IS NULL;

-- Index for active project lookups on API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active_project
ON api_keys(active_project_id)
WHERE active_project_id IS NOT NULL AND revoked_at IS NULL;

-- Add comment documentation
COMMENT ON COLUMN projects.workspace_path IS 'Filesystem path for workspace binding (e.g., /Users/dev/my-project)';
COMMENT ON COLUMN api_keys.active_project_id IS 'Currently active project for this API key (like gh repo set-default)';
