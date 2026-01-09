/**
 * Collaboration Utilities
 *
 * Provides helper functions for the collaboration system:
 * - Token generation and validation
 * - Activity logging
 * - Invitation management
 */

import crypto from "crypto";
import { sql } from "@/lib/db/client";
import { sendInvitationEmail, sendCollaboratorJoinedEmail } from "@/lib/email";
import type {
  CollaboratorRole,
  CollaborationActionType,
  ProjectInvitation,
  InvitationStatus,
} from "@/lib/db/schema";

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a secure invitation token
 * Returns both the plaintext token (to share) and its hash (to store)
 */
export function generateInviteToken(): { token: string; hash: string } {
  // Generate 24 random bytes and encode as base64url
  const randomBytes = crypto.randomBytes(24);
  const token = `inv_${randomBytes.toString("base64url")}`;

  // Hash the token for secure storage
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  return { token, hash };
}

/**
 * Hash a token for database lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ============================================================================
// Activity Logging
// ============================================================================

export interface LogActivityParams {
  projectId: string;
  actorId: string;
  actorRole: string;
  actionType: CollaborationActionType;
  description: string;
  targetType?: "user" | "invitation" | "step" | "document" | "project" | "note" | "adr";
  targetId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log a collaboration activity to the activity log
 *
 * This should be called after any significant action:
 * - Collaboration management (invite, join, leave, role change)
 * - Project modifications by collaborators
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await sql`
      INSERT INTO collaboration_activity_log (
        project_id, actor_id, actor_role, action_type,
        target_type, target_id, description,
        old_value, new_value, metadata,
        ip_address, user_agent
      ) VALUES (
        ${params.projectId},
        ${params.actorId},
        ${params.actorRole},
        ${params.actionType},
        ${params.targetType || null},
        ${params.targetId || null},
        ${params.description},
        ${params.oldValue ? JSON.stringify(params.oldValue) : null}::jsonb,
        ${params.newValue ? JSON.stringify(params.newValue) : null}::jsonb,
        ${JSON.stringify(params.metadata || {})}::jsonb,
        ${params.ipAddress || null}::inet,
        ${params.userAgent || null}
      )
    `;
  } catch (error) {
    // Log but don't throw - activity logging should not break main operations
    console.error("Failed to log collaboration activity:", error);
  }
}

// ============================================================================
// Invitation Validation
// ============================================================================

export interface ValidatedInvitation {
  id: string;
  projectId: string;
  projectName: string;
  invitationType: "email" | "link";
  inviteeEmail: string | null;
  role: CollaboratorRole;
  maxUses: number;
  currentUses: number;
  expiresAt: Date;
  invitedBy: string;
  inviterName: string | null;
  inviterEmail: string;
  status: InvitationStatus;
  message: string | null;
}

export interface InvitationValidationResult {
  valid: boolean;
  invitation?: ValidatedInvitation;
  error?: string;
  errorCode?: "NOT_FOUND" | "EXPIRED" | "MAX_USES" | "REVOKED" | "ACCEPTED";
}

/**
 * Validate an invitation token and return invitation details
 *
 * This checks:
 * - Token exists
 * - Status is pending
 * - Not expired
 * - Usage limit not reached
 */
export async function validateInvitation(
  token: string
): Promise<InvitationValidationResult> {
  const tokenHash = hashToken(token);

  try {
    const result = await sql`
      SELECT
        pi.id,
        pi.project_id,
        p.name as project_name,
        pi.invitation_type,
        pi.invitee_email,
        pi.role,
        pi.max_uses,
        pi.current_uses,
        pi.expires_at,
        pi.invited_by,
        u.name as inviter_name,
        u.email as inviter_email,
        pi.status,
        pi.message
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      JOIN users u ON pi.invited_by = u.id
      WHERE pi.token_hash = ${tokenHash}
    `;

    if (result.length === 0) {
      return { valid: false, error: "Invitation not found", errorCode: "NOT_FOUND" };
    }

    const inv = result[0];

    // Check status
    if (inv.status === "accepted") {
      return { valid: false, error: "Invitation has already been used", errorCode: "ACCEPTED" };
    }

    if (inv.status === "revoked") {
      return { valid: false, error: "Invitation has been revoked", errorCode: "REVOKED" };
    }

    if (inv.status === "expired") {
      return { valid: false, error: "Invitation has expired", errorCode: "EXPIRED" };
    }

    // Check expiration
    if (new Date(inv.expires_at) < new Date()) {
      // Update status to expired in database
      await sql`
        UPDATE project_invitations
        SET status = 'expired', updated_at = NOW()
        WHERE id = ${inv.id}
      `;
      return { valid: false, error: "Invitation has expired", errorCode: "EXPIRED" };
    }

    // Check usage limit
    if (inv.current_uses >= inv.max_uses) {
      return { valid: false, error: "Invitation has reached maximum uses", errorCode: "MAX_USES" };
    }

    return {
      valid: true,
      invitation: {
        id: inv.id,
        projectId: inv.project_id,
        projectName: inv.project_name,
        invitationType: inv.invitation_type,
        inviteeEmail: inv.invitee_email,
        role: inv.role,
        maxUses: inv.max_uses,
        currentUses: inv.current_uses,
        expiresAt: new Date(inv.expires_at),
        invitedBy: inv.invited_by,
        inviterName: inv.inviter_name,
        inviterEmail: inv.inviter_email,
        status: inv.status,
        message: inv.message,
      },
    };
  } catch (error) {
    console.error("Invitation validation error:", error);
    return { valid: false, error: "Failed to validate invitation" };
  }
}

/**
 * Accept an invitation and add user as collaborator
 *
 * This:
 * 1. Validates the invitation
 * 2. Creates the collaborator record
 * 3. Updates invitation usage count
 * 4. Logs the activity
 */
export async function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  success: boolean;
  collaboratorId?: string;
  projectId?: string;
  projectName?: string;
  role?: CollaboratorRole;
  error?: string;
  errorCode?: string;
}> {
  // Validate invitation
  const validation = await validateInvitation(token);

  if (!validation.valid || !validation.invitation) {
    return {
      success: false,
      error: validation.error,
      errorCode: validation.errorCode,
    };
  }

  const inv = validation.invitation;

  // For email invitations, check that the accepting user's email matches
  if (inv.invitationType === "email" && inv.inviteeEmail) {
    if (inv.inviteeEmail.toLowerCase() !== userEmail.toLowerCase()) {
      return {
        success: false,
        error: "This invitation was sent to a different email address",
        errorCode: "EMAIL_MISMATCH",
      };
    }
  }

  try {
    // Check if user is already a collaborator
    const existingCollaborator = await sql`
      SELECT id, removed_at FROM project_collaborators
      WHERE project_id = ${inv.projectId} AND user_id = ${userId}
    `;

    let collaboratorId: string;

    if (existingCollaborator.length > 0) {
      // User was previously a collaborator
      if (existingCollaborator[0].removed_at === null) {
        return {
          success: false,
          error: "You are already a collaborator on this project",
          errorCode: "ALREADY_COLLABORATOR",
        };
      }

      // Re-activate the collaborator record
      const updateResult = await sql`
        UPDATE project_collaborators
        SET role = ${inv.role},
            accepted_at = NOW(),
            removed_at = NULL,
            removed_by = NULL,
            invited_by = ${inv.invitedBy},
            invited_at = NOW(),
            updated_at = NOW()
        WHERE id = ${existingCollaborator[0].id}
        RETURNING id
      `;
      collaboratorId = updateResult[0].id;
    } else {
      // Create new collaborator record
      const insertResult = await sql`
        INSERT INTO project_collaborators (
          project_id, user_id, role, invited_by, invited_at, accepted_at
        ) VALUES (
          ${inv.projectId}, ${userId}, ${inv.role}, ${inv.invitedBy}, NOW(), NOW()
        )
        RETURNING id
      `;
      collaboratorId = insertResult[0].id;
    }

    // Update invitation usage
    const newUses = inv.currentUses + 1;
    const newStatus: InvitationStatus = newUses >= inv.maxUses ? "accepted" : "pending";

    await sql`
      UPDATE project_invitations
      SET current_uses = ${newUses},
          status = ${newStatus},
          updated_at = NOW()
      WHERE id = ${inv.id}
    `;

    // Log activity
    await logActivity({
      projectId: inv.projectId,
      actorId: userId,
      actorRole: inv.role,
      actionType: "collaborator_joined",
      description: `Joined the project as ${inv.role}`,
      targetType: "user",
      targetId: userId,
      newValue: { role: inv.role, invitedBy: inv.invitedBy },
      ipAddress,
      userAgent,
    });

    // Send notification emails to owner and admins
    // Get the joining user's details
    const joiningUser = await sql`
      SELECT name, email FROM users WHERE id = ${userId}
    `;
    const joiningUserName = joiningUser[0]?.name || joiningUser[0]?.email || "A new user";
    const joiningUserEmail = joiningUser[0]?.email;

    // Get owner and admin emails
    const notifyUsers = await sql`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      WHERE u.id IN (
        -- Project owner
        SELECT user_id FROM projects WHERE id = ${inv.projectId}
        UNION
        -- Project admins
        SELECT pc.user_id FROM project_collaborators pc
        WHERE pc.project_id = ${inv.projectId}
          AND pc.role = 'admin'
          AND pc.removed_at IS NULL
      )
      AND u.id != ${userId}
    `;

    // Send notification emails (fire and forget, don't block on failures)
    for (const recipient of notifyUsers) {
      sendCollaboratorJoinedEmail({
        to: recipient.email,
        recipientName: recipient.name || recipient.email,
        projectId: inv.projectId,
        projectName: inv.projectName,
        collaboratorName: joiningUserName,
        collaboratorEmail: joiningUserEmail,
        role: inv.role,
      }).catch((err) => {
        console.warn(`Failed to send collaborator joined notification to ${recipient.email}:`, err);
      });
    }

    return {
      success: true,
      collaboratorId,
      projectId: inv.projectId,
      projectName: inv.projectName,
      role: inv.role,
    };
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    return {
      success: false,
      error: "Failed to accept invitation",
      errorCode: "INTERNAL_ERROR",
    };
  }
}

// ============================================================================
// Invitation Creation
// ============================================================================

export interface CreateInvitationParams {
  projectId: string;
  invitedBy: string;
  type: "email" | "link";
  role: CollaboratorRole;
  email?: string;
  message?: string;
  expiresInHours?: number;
  maxUses?: number;
}

export interface CreateInvitationResult {
  success: boolean;
  invitation?: {
    id: string;
    token: string;
    expiresAt: Date;
  };
  error?: string;
}

/**
 * Create a new invitation
 *
 * For email invitations, the email parameter is required.
 * For link invitations, maxUses can be set (default 1).
 */
export async function createInvitation(
  params: CreateInvitationParams
): Promise<CreateInvitationResult> {
  const {
    projectId,
    invitedBy,
    type,
    role,
    email,
    message,
    expiresInHours = type === "email" ? 72 : 168, // 3 days for email, 7 days for links
    maxUses = type === "email" ? 1 : 1,
  } = params;

  // Validate email for email invitations
  if (type === "email") {
    if (!email) {
      return { success: false, error: "Email is required for email invitations" };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, error: "Invalid email address" };
    }

    // Check if there's already a pending invitation for this email
    const existingInvite = await sql`
      SELECT id FROM project_invitations
      WHERE project_id = ${projectId}
        AND invitee_email = ${email.toLowerCase()}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    if (existingInvite.length > 0) {
      return { success: false, error: "An invitation is already pending for this email" };
    }

    // Check if user with this email is already a collaborator
    const existingCollaborator = await sql`
      SELECT pc.id FROM project_collaborators pc
      JOIN users u ON pc.user_id = u.id
      WHERE pc.project_id = ${projectId}
        AND u.email = ${email.toLowerCase()}
        AND pc.removed_at IS NULL
    `;

    if (existingCollaborator.length > 0) {
      return { success: false, error: "This user is already a collaborator" };
    }
  }

  // Generate token
  const { token, hash } = generateInviteToken();

  // Calculate expiration
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  try {
    // Get inviter details for email
    const inviterInfo = await sql`
      SELECT name, email FROM users WHERE id = ${invitedBy}
    `;
    const inviterName = inviterInfo[0]?.name || inviterInfo[0]?.email || "Someone";

    // Get project name for email
    const projectInfo = await sql`
      SELECT name FROM projects WHERE id = ${projectId}
    `;
    const projectName = projectInfo[0]?.name || "a project";

    const result = await sql`
      INSERT INTO project_invitations (
        project_id, invitation_type, invitee_email, token, token_hash,
        role, max_uses, expires_at, invited_by, message
      ) VALUES (
        ${projectId},
        ${type},
        ${type === "email" ? email!.toLowerCase() : null},
        ${token},
        ${hash},
        ${role},
        ${maxUses},
        ${expiresAt.toISOString()},
        ${invitedBy},
        ${message || null}
      )
      RETURNING id
    `;

    // Send invitation email for email-type invitations
    if (type === "email" && email) {
      const emailResult = await sendInvitationEmail({
        to: email,
        token,
        projectName,
        inviterName,
        role,
        message,
        expiresAt,
      });

      if (!emailResult.success) {
        console.warn(`Failed to send invitation email to ${email}:`, emailResult.error);
        // Don't fail the invitation creation if email fails - the invite link still works
      }
    }

    return {
      success: true,
      invitation: {
        id: result[0].id,
        token,
        expiresAt,
      },
    };
  } catch (error) {
    console.error("Failed to create invitation:", error);
    return { success: false, error: "Failed to create invitation" };
  }
}

// ============================================================================
// Collaborator Management
// ============================================================================

/**
 * Update a collaborator's role
 */
export async function updateCollaboratorRole(
  collaboratorId: string,
  newRole: CollaboratorRole,
  updatedBy: string,
  updatedByRole: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current role for logging
    const current = await sql`
      SELECT role, user_id FROM project_collaborators
      WHERE id = ${collaboratorId} AND removed_at IS NULL
    `;

    if (current.length === 0) {
      return { success: false, error: "Collaborator not found" };
    }

    const oldRole = current[0].role;
    const targetUserId = current[0].user_id;

    // Update role
    await sql`
      UPDATE project_collaborators
      SET role = ${newRole}, updated_at = NOW()
      WHERE id = ${collaboratorId}
    `;

    // Log activity
    await logActivity({
      projectId,
      actorId: updatedBy,
      actorRole: updatedByRole,
      actionType: "role_changed",
      description: `Changed collaborator role from ${oldRole} to ${newRole}`,
      targetType: "user",
      targetId: targetUserId,
      oldValue: { role: oldRole },
      newValue: { role: newRole },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to update collaborator role:", error);
    return { success: false, error: "Failed to update role" };
  }
}

/**
 * Remove a collaborator from a project
 */
export async function removeCollaborator(
  collaboratorId: string,
  removedBy: string,
  removedByRole: string,
  projectId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get collaborator info for logging
    const collaborator = await sql`
      SELECT user_id, role FROM project_collaborators
      WHERE id = ${collaboratorId} AND removed_at IS NULL
    `;

    if (collaborator.length === 0) {
      return { success: false, error: "Collaborator not found" };
    }

    const targetUserId = collaborator[0].user_id;
    const targetRole = collaborator[0].role;
    const isSelfRemoval = targetUserId === removedBy;

    // Soft delete
    await sql`
      UPDATE project_collaborators
      SET removed_at = NOW(),
          removed_by = ${removedBy},
          updated_at = NOW()
      WHERE id = ${collaboratorId}
    `;

    // Log activity
    await logActivity({
      projectId,
      actorId: removedBy,
      actorRole: removedByRole,
      actionType: isSelfRemoval ? "collaborator_left" : "collaborator_removed",
      description: isSelfRemoval
        ? "Left the project"
        : `Removed collaborator from the project${reason ? `: ${reason}` : ""}`,
      targetType: "user",
      targetId: targetUserId,
      oldValue: { role: targetRole },
      metadata: reason ? { reason } : undefined,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to remove collaborator:", error);
    return { success: false, error: "Failed to remove collaborator" };
  }
}
