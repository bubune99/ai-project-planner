-- Migration 024: Project Collaboration System
-- Creates tables for multi-user project collaboration with role-based access
-- and full activity tracking

-- =============================================================================
-- Table 1: project_collaborators
-- Stores active collaborators for each project with their roles
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Role: viewer (read-only), editor (can modify), admin (can manage members)
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),

  -- Who invited this collaborator
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- When the invitation was accepted (null = pending)
  accepted_at TIMESTAMP,

  -- Soft delete for removed collaborators
  removed_at TIMESTAMP,
  removed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Additional metadata (e.g., invitation message, notes)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Each user can only be a collaborator once per project
  CONSTRAINT unique_project_collaborator UNIQUE (project_id, user_id)
);

-- Indexes for project_collaborators
CREATE INDEX IF NOT EXISTS idx_collaborators_project_id
  ON project_collaborators(project_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_user_id
  ON project_collaborators(user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_project_role
  ON project_collaborators(project_id, role) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_user_accepted
  ON project_collaborators(user_id, accepted_at) WHERE removed_at IS NULL AND accepted_at IS NOT NULL;

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_project_collaborators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_project_collaborators_updated_at
  BEFORE UPDATE ON project_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION update_project_collaborators_updated_at();

-- =============================================================================
-- Table 2: project_invitations
-- Stores pending invitations (both email and link-based)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Invitation type: 'email' for direct email invites, 'link' for shareable links
  invitation_type TEXT NOT NULL CHECK (invitation_type IN ('email', 'link')),

  -- Email invitation fields (null for link-based invitations)
  invitee_email VARCHAR(255),

  -- Secure token for invitation links
  -- Token is shown to user once on creation, only hash is stored for lookup
  token VARCHAR(64) NOT NULL UNIQUE,
  token_hash VARCHAR(64) NOT NULL,

  -- Role to be assigned upon acceptance
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),

  -- Usage limits
  max_uses INTEGER NOT NULL DEFAULT 1,  -- 1 for email invites, configurable for links
  current_uses INTEGER NOT NULL DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMP NOT NULL,

  -- Tracking
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Status: 'pending', 'accepted', 'expired', 'revoked'
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

  -- Optional message to include in invitation
  message TEXT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Email invites must have an email
  CONSTRAINT email_invite_requires_email
    CHECK (invitation_type != 'email' OR invitee_email IS NOT NULL)
);

-- Indexes for project_invitations
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

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_project_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_project_invitations_updated_at
  BEFORE UPDATE ON project_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_project_invitations_updated_at();

-- =============================================================================
-- Table 3: collaboration_activity_log
-- Tracks all collaboration-related actions for audit trail
-- =============================================================================
CREATE TABLE IF NOT EXISTS collaboration_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Who performed the action
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL,  -- Role at time of action (owner, admin, editor, viewer)

  -- What action was performed
  action_type TEXT NOT NULL CHECK (action_type IN (
    -- Collaboration management actions
    'collaborator_invited',
    'collaborator_joined',
    'collaborator_removed',
    'collaborator_left',
    'role_changed',
    'invitation_created',
    'invitation_revoked',
    'invitation_expired',
    'link_generated',

    -- Project actions by collaborators
    'project_viewed',
    'project_updated',
    'step_created',
    'step_updated',
    'step_deleted',
    'step_status_changed',
    'document_created',
    'document_updated',
    'document_deleted',
    'note_created',
    'note_updated',
    'comment_added',
    'adr_created',
    'adr_updated'
  )),

  -- Target of the action (if applicable)
  target_type TEXT CHECK (target_type IN ('user', 'invitation', 'step', 'document', 'project', 'note', 'adr')),
  target_id UUID,

  -- Human-readable description
  description TEXT NOT NULL,

  -- For tracking changes
  old_value JSONB,
  new_value JSONB,

  -- Additional context
  metadata JSONB DEFAULT '{}',

  -- IP and user agent for security auditing
  ip_address INET,
  user_agent TEXT,

  -- Timestamp (no updated_at needed - logs are immutable)
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for collaboration_activity_log
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
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE project_collaborators IS 'Stores active collaborators for projects with role-based access control';
COMMENT ON TABLE project_invitations IS 'Stores pending invitations via email or shareable links with expiration and usage limits';
COMMENT ON TABLE collaboration_activity_log IS 'Immutable audit log of all collaboration-related actions for security and tracking';

COMMENT ON COLUMN project_collaborators.role IS 'Access level: viewer (read-only), editor (can modify project data), admin (can manage members)';
COMMENT ON COLUMN project_collaborators.accepted_at IS 'Timestamp when user accepted the invitation (null = pending acceptance)';
COMMENT ON COLUMN project_collaborators.removed_at IS 'Soft delete timestamp - collaborator was removed but record kept for audit';

COMMENT ON COLUMN project_invitations.token IS 'Secure random token for invitation URL (shown to inviter once, used for validation)';
COMMENT ON COLUMN project_invitations.token_hash IS 'SHA-256 hash of token for secure database lookup without storing plaintext';
COMMENT ON COLUMN project_invitations.max_uses IS 'Maximum number of times this invitation can be used (1 for email, configurable for links)';
COMMENT ON COLUMN project_invitations.current_uses IS 'Number of times this invitation has been successfully used';

COMMENT ON COLUMN collaboration_activity_log.actor_role IS 'Role of the actor at the time of action (for historical accuracy)';
COMMENT ON COLUMN collaboration_activity_log.old_value IS 'Previous state before the action (for change tracking)';
COMMENT ON COLUMN collaboration_activity_log.new_value IS 'New state after the action (for change tracking)';
