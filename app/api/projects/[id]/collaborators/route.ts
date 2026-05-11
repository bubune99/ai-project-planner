import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";
import {

  getProjectAccess,
  getProjectAccessList,
  canPerformAction,
} from "@/lib/auth/collaboration-access";
import { createInvitation, logActivity } from "@/lib/collaboration";
import type { CollaboratorRole } from "@/lib/db/schema";

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/collaborators
 * List all collaborators for a project (including owner)
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

    // Verify user has access to this project
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Get owner and collaborators
    const accessList = await getProjectAccessList(projectId);

    // Get pending invitations count
    const pendingInvites = await sql`
      SELECT COUNT(*) as count FROM project_invitations
      WHERE project_id = ${projectId}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    return successResponse({
      owner: accessList.owner,
      collaborators: accessList.collaborators,
      pendingInvitationsCount: parseInt(pendingInvites[0].count, 10),
    });
  } catch (error) {
    console.error("Error fetching collaborators:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch collaborators", 500);
  }
}

/**
 * POST /api/projects/[id]/collaborators
 * Invite a new collaborator via email
 *
 * Body: { email: string, role: CollaboratorRole, message?: string }
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

    // Only owner and admin can invite collaborators
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can invite collaborators",
        403
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, role, message } = body as {
      email?: string;
      role?: CollaboratorRole;
      message?: string;
    };

    // Validate required fields
    if (!email) {
      return errorResponse("VALIDATION_ERROR", "Email is required", 400);
    }

    if (!role || !["viewer", "editor", "admin"].includes(role)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Role must be one of: viewer, editor, admin",
        400
      );
    }

    // Only owner can invite admins
    if (role === "admin" && !access.isOwner) {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner can invite admin collaborators",
        403
      );
    }

    // Check if invited user is the project owner
    const projectOwner = await sql`
      SELECT u.email FROM projects p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ${projectId}
    `;

    if (projectOwner[0]?.email.toLowerCase() === email.toLowerCase()) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Cannot invite the project owner as a collaborator",
        400
      );
    }

    // Create invitation
    const result = await createInvitation({
      projectId,
      invitedBy: userId,
      type: "email",
      role,
      email,
      message,
    });

    if (!result.success) {
      return errorResponse("VALIDATION_ERROR", result.error || "Failed to create invitation", 400);
    }

    // Log activity
    await logActivity({
      projectId,
      actorId: userId,
      actorRole: access.isOwner ? "owner" : access.role,
      actionType: "collaborator_invited",
      description: `Invited ${email} as ${role}`,
      targetType: "invitation",
      targetId: result.invitation!.id,
      newValue: { email, role },
    });

    // Get project name for email
    const project = await sql`
      SELECT name FROM projects WHERE id = ${projectId}
    `;

    // TODO: Send invitation email
    // For now, return the invitation URL that would be emailed
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${result.invitation!.token}`;

    return successResponse(
      {
        invitationId: result.invitation!.id,
        email,
        role,
        expiresAt: result.invitation!.expiresAt,
        inviteUrl, // In production, this would only be sent via email
      },
      undefined,
      201
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create invitation", 500);
  }
}
