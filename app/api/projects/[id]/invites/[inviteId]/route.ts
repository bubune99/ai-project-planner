import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getProjectAccess } from "@/lib/auth/collaboration-access";
import { generateInviteToken, logActivity } from "@/lib/collaboration";

export const dynamic = "force-dynamic"

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

/**
 * PATCH /api/projects/[id]/invites/[inviteId]  { action: "new-link" }
 * A pending invite's link again (owner, 2026-11-16: "Yes, all three", inbox question 74ef893a). Only the hash of a
 * link is stored, so the link cannot be read back; this issues a fresh one for the same invite and the old one stops
 * working. Owner or admin only, pending invites only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    const { id: projectId, inviteId } = await params;
    const access = await getProjectAccess(projectId, authContext.userId);
    if (!access) return errorResponse("NOT_FOUND", "Project not found", 404);
    if (!access.isOwner && access.role !== "admin") return errorResponse("FORBIDDEN", "Only the project owner or an admin can do this", 403);
    const body = await request.json().catch(() => null);
    if (body?.action !== "new-link") return errorResponse("VALIDATION_ERROR", 'action must be "new-link"', 400);
    const { token, hash } = generateInviteToken();
    const rows = (await sql`
      UPDATE project_invitations SET token_hash = ${hash}, updated_at = NOW()
       WHERE id = ${inviteId} AND project_id = ${projectId} AND status = 'pending' AND expires_at > NOW()
      RETURNING id
    `) as { id: string }[];
    if (!rows.length) return errorResponse("NOT_FOUND", "No pending invite with that id", 404);
    await logActivity({
      projectId, actorId: authContext.userId, actorRole: access.isOwner ? "owner" : access.role,
      actionType: "link_generated", description: "Issued a new link for a pending invitation (the old link stopped working)",
      targetType: "invitation", targetId: inviteId, newValue: { reissued: true },
    });
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${token}`;
    return successResponse({ id: inviteId, inviteUrl });
  } catch (error) {
    console.error("Error reissuing invitation link:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to make a new link", 500);
  }
}
