-- Fix: Create project_collaborators and related tables from migration 024
-- Run against production Neon database to resolve "relation project_collaborators does not exist"
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE

BEGIN;

-- =============================================================================
-- Table 1: project_collaborators
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  removed_at TIMESTAMP,
  removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_collaborator UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_project_id
  ON project_collaborators(project_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_user_id
  ON project_collaborators(user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_project_role
  ON project_collaborators(project_id, role) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_user_accepted
  ON project_collaborators(user_id, accepted_at) WHERE removed_at IS NULL AND accepted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION update_project_collaborators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_collaborators_updated_at ON project_collaborators;
CREATE TRIGGER trigger_update_project_collaborators_updated_at
  BEFORE UPDATE ON project_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION update_project_collaborators_updated_at();

-- =============================================================================
-- Table 2: project_invitations
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invitation_type TEXT NOT NULL CHECK (invitation_type IN ('email', 'link')),
  invitee_email VARCHAR(255),
  token VARCHAR(64) NOT NULL UNIQUE,
  token_hash VARCHAR(64) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  max_uses INTEGER NOT NULL DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT email_invite_requires_email
    CHECK (invitation_type != 'email' OR invitee_email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_invitations_project_id
  ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
  ON project_invitations(token_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_email
  ON project_invitations(invitee_email) WHERE status = 'pending' AND invitee_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_expires
  ON project_invitations(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by
  ON project_invitations(invited_by);

CREATE OR REPLACE FUNCTION update_project_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_invitations_updated_at ON project_invitations;
CREATE TRIGGER trigger_update_project_invitations_updated_at
  BEFORE UPDATE ON project_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_project_invitations_updated_at();

-- =============================================================================
-- Table 3: collaboration_activity_log
-- =============================================================================
CREATE TABLE IF NOT EXISTS collaboration_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'collaborator_invited', 'collaborator_joined', 'collaborator_removed',
    'collaborator_left', 'role_changed', 'invitation_created',
    'invitation_revoked', 'invitation_expired', 'link_generated',
    'project_viewed', 'project_updated',
    'step_created', 'step_updated', 'step_deleted', 'step_status_changed',
    'document_created', 'document_updated', 'document_deleted',
    'note_created', 'note_updated', 'comment_added',
    'adr_created', 'adr_updated'
  )),
  target_type TEXT CHECK (target_type IN ('user', 'invitation', 'step', 'document', 'project', 'note', 'adr')),
  target_id UUID,
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_project_id
  ON collaboration_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor_id
  ON collaboration_activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_project_created
  ON collaboration_activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action_type
  ON collaboration_activity_log(project_id, action_type);
CREATE INDEX IF NOT EXISTS idx_activity_target
  ON collaboration_activity_log(target_type, target_id) WHERE target_id IS NOT NULL;

-- =============================================================================
-- Table comments
-- =============================================================================
COMMENT ON TABLE project_collaborators IS 'Stores active collaborators for projects with role-based access control';
COMMENT ON TABLE project_invitations IS 'Stores pending invitations via email or shareable links with expiration and usage limits';
COMMENT ON TABLE collaboration_activity_log IS 'Immutable audit log of all collaboration-related actions for security and tracking';

COMMIT;
