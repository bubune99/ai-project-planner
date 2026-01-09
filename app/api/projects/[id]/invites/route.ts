import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getProjectAccess } from "@/lib/auth/collaboration-access";
import { createInvitation, logActivity } from "@/lib/collaboration";
import type { CollaboratorRole } from "@/lib/db/schema";

/**
 * GET /api/projects/[id]/invites
 * List all pending invitations for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Only owner and admin can view invitations
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can view invitations",
        403
      );
    }

    // Get pending invitations
    const invitations = await sql`
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
        u.name as inviter_name,
        u.email as inviter_email
      FROM project_invitations pi
      JOIN users u ON pi.invited_by = u.id
      WHERE pi.project_id = ${projectId}
        AND pi.status = 'pending'
        AND pi.expires_at > NOW()
      ORDER BY pi.created_at DESC
    `;

    return successResponse({
      invitations,
      total: invitations.length,
    });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch invitations", 500);
  }
}

/**
 * POST /api/projects/[id]/invites
 * Create a new invitation (email or link)
 *
 * Body: {
 *   type: 'email' | 'link',
 *   email?: string,  // required for email type
 *   role: CollaboratorRole,
 *   message?: string,
 *   expiresInHours?: number,
 *   maxUses?: number  // for link type
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Only owner and admin can create invitations
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can create invitations",
        403
      );
    }

    // Parse request body
    const body = await request.json();
    const { type, email, role, message, expiresInHours, maxUses } = body as {
      type?: "email" | "link";
      email?: string;
      role?: CollaboratorRole;
      message?: string;
      expiresInHours?: number;
      maxUses?: number;
    };

    // Validate type
    if (!type || !["email", "link"].includes(type)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Type must be 'email' or 'link'",
        400
      );
    }

    // Validate role
    if (!role || !["viewer", "editor", "admin"].includes(role)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Role must be one of: viewer, editor, admin",
        400
      );
    }

    // Only owner can create admin invitations
    if (role === "admin" && !access.isOwner) {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner can create admin invitations",
        403
      );
    }

    // For email type, check if inviting the project owner
    if (type === "email" && email) {
      const projectOwner = await sql`
        SELECT u.email FROM projects p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ${projectId}
      `;

      if (projectOwner[0]?.email.toLowerCase() === email.toLowerCase()) {
        return errorResponse(
          "VALIDATION_ERROR",
          "Cannot invite the project owner",
          400
        );
      }
    }

    // Create invitation
    const result = await createInvitation({
      projectId,
      invitedBy: userId,
      type,
      role,
      email: type === "email" ? email : undefined,
      message,
      expiresInHours,
      maxUses: type === "link" ? (maxUses || 10) : 1,
    });

    if (!result.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        result.error || "Failed to create invitation",
        400
      );
    }

    // Log activity
    await logActivity({
      projectId,
      actorId: userId,
      actorRole: access.isOwner ? "owner" : access.role,
      actionType: type === "link" ? "link_generated" : "invitation_created",
      description:
        type === "link"
          ? `Generated shareable ${role} invitation link`
          : `Created email invitation for ${email} as ${role}`,
      targetType: "invitation",
      targetId: result.invitation!.id,
      newValue: { type, role, email: email || null },
    });

    // Build invite URL
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${result.invitation!.token}`;

    return successResponse(
      {
        invitationId: result.invitation!.id,
        type,
        role,
        email: type === "email" ? email : undefined,
        expiresAt: result.invitation!.expiresAt,
        inviteUrl,
        maxUses: type === "link" ? (maxUses || 10) : 1,
      },
      undefined,
      201
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create invitation", 500);
  }
}
