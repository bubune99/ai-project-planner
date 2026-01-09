import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getProjectAccess } from "@/lib/auth/collaboration-access";
import { logActivity } from "@/lib/collaboration";

/**
 * GET /api/projects/[id]/invites/[inviteId]
 * Get details of a specific invitation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId, inviteId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Only owner and admin can view invitation details
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can view invitation details",
        403
      );
    }

    // Get invitation
    const invitation = await sql`
      SELECT
        pi.id,
        pi.invitation_type,
        pi.invitee_email,
        pi.role,
        pi.max_uses,
        pi.current_uses,
        pi.expires_at,
        pi.status,
        pi.message,
        pi.created_at,
        pi.updated_at,
        u.name as inviter_name,
        u.email as inviter_email
      FROM project_invitations pi
      JOIN users u ON pi.invited_by = u.id
      WHERE pi.id = ${inviteId}
        AND pi.project_id = ${projectId}
    `;

    if (invitation.length === 0) {
      return errorResponse("NOT_FOUND", "Invitation not found", 404);
    }

    return successResponse(invitation[0]);
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch invitation", 500);
  }
}

/**
 * DELETE /api/projects/[id]/invites/[inviteId]
 * Revoke an invitation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId, inviteId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Only owner and admin can revoke invitations
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can revoke invitations",
        403
      );
    }

    // Get invitation details before revoking
    const invitation = await sql`
      SELECT id, invitation_type, invitee_email, role, status
      FROM project_invitations
      WHERE id = ${inviteId}
        AND project_id = ${projectId}
    `;

    if (invitation.length === 0) {
      return errorResponse("NOT_FOUND", "Invitation not found", 404);
    }

    const inv = invitation[0];

    // Can only revoke pending invitations
    if (inv.status !== "pending") {
      return errorResponse(
        "VALIDATION_ERROR",
        `Cannot revoke invitation with status '${inv.status}'`,
        400
      );
    }

    // Revoke the invitation
    await sql`
      UPDATE project_invitations
      SET status = 'revoked', updated_at = NOW()
      WHERE id = ${inviteId}
    `;

    // Log activity
    await logActivity({
      projectId,
      actorId: userId,
      actorRole: access.isOwner ? "owner" : access.role,
      actionType: "invitation_revoked",
      description:
        inv.invitation_type === "email"
          ? `Revoked invitation for ${inv.invitee_email}`
          : `Revoked shareable ${inv.role} invitation link`,
      targetType: "invitation",
      targetId: inviteId,
      oldValue: { status: "pending", role: inv.role, email: inv.invitee_email },
      newValue: { status: "revoked" },
    });

    return successResponse({
      revoked: true,
      invitationId: inviteId,
    });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to revoke invitation", 500);
  }
}
