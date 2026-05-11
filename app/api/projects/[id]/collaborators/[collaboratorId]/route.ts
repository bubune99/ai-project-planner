import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getProjectAccess } from "@/lib/auth/collaboration-access";
import { updateCollaboratorRole, removeCollaborator } from "@/lib/collaboration";
import type { CollaboratorRole } from "@/lib/db/schema";

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/collaborators/[collaboratorId]
 * Get a specific collaborator's details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId, collaboratorId } = await params;

    // Verify user has access to this project
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Get collaborator details
    const collaborator = await sql`
      SELECT
        pc.id,
        pc.user_id,
        pc.role,
        pc.invited_by,
        pc.invited_at,
        pc.accepted_at,
        u.name,
        u.email,
        u.avatar_url,
        inviter.name as inviter_name,
        inviter.email as inviter_email
      FROM project_collaborators pc
      JOIN users u ON pc.user_id = u.id
      LEFT JOIN users inviter ON pc.invited_by = inviter.id
      WHERE pc.id = ${collaboratorId}
        AND pc.project_id = ${projectId}
        AND pc.removed_at IS NULL
    `;

    if (collaborator.length === 0) {
      return errorResponse("NOT_FOUND", "Collaborator not found", 404);
    }

    return successResponse(collaborator[0]);
  } catch (error) {
    console.error("Error fetching collaborator:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch collaborator", 500);
  }
}

/**
 * PATCH /api/projects/[id]/collaborators/[collaboratorId]
 * Update a collaborator's role
 *
 * Body: { role: CollaboratorRole }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId, collaboratorId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Only owner and admin can update roles
    if (!access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can update collaborator roles",
        403
      );
    }

    // Parse request body
    const body = await request.json();
    const { role } = body as { role?: CollaboratorRole };

    if (!role || !["viewer", "editor", "admin"].includes(role)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Role must be one of: viewer, editor, admin",
        400
      );
    }

    // Get the target collaborator
    const targetCollaborator = await sql`
      SELECT user_id, role FROM project_collaborators
      WHERE id = ${collaboratorId}
        AND project_id = ${projectId}
        AND removed_at IS NULL
    `;

    if (targetCollaborator.length === 0) {
      return errorResponse("NOT_FOUND", "Collaborator not found", 404);
    }

    // Admins cannot promote others to admin or change other admins
    if (!access.isOwner) {
      if (role === "admin") {
        return errorResponse(
          "FORBIDDEN",
          "Only project owner can promote to admin",
          403
        );
      }
      if (targetCollaborator[0].role === "admin") {
        return errorResponse(
          "FORBIDDEN",
          "Only project owner can change admin roles",
          403
        );
      }
    }

    // Cannot change own role (must leave and be re-invited)
    if (targetCollaborator[0].user_id === userId) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Cannot change your own role. Leave the project and be re-invited instead.",
        400
      );
    }

    // Update role
    const result = await updateCollaboratorRole(
      collaboratorId,
      role,
      userId,
      access.isOwner ? "owner" : access.role,
      projectId
    );

    if (!result.success) {
      return errorResponse("INTERNAL_ERROR", result.error || "Failed to update role", 500);
    }

    return successResponse({ collaboratorId, role });
  } catch (error) {
    console.error("Error updating collaborator:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update collaborator", 500);
  }
}

/**
 * DELETE /api/projects/[id]/collaborators/[collaboratorId]
 * Remove a collaborator from the project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId, collaboratorId } = await params;

    // Get user's access level
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Get the target collaborator
    const targetCollaborator = await sql`
      SELECT user_id, role FROM project_collaborators
      WHERE id = ${collaboratorId}
        AND project_id = ${projectId}
        AND removed_at IS NULL
    `;

    if (targetCollaborator.length === 0) {
      return errorResponse("NOT_FOUND", "Collaborator not found", 404);
    }

    const targetUserId = targetCollaborator[0].user_id;
    const isSelfRemoval = targetUserId === userId;

    // Users can always remove themselves
    // Owner and admin can remove others
    if (!isSelfRemoval && !access.isOwner && access.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner or admin can remove collaborators",
        403
      );
    }

    // Admins cannot remove other admins (only owner can)
    if (
      !access.isOwner &&
      !isSelfRemoval &&
      targetCollaborator[0].role === "admin"
    ) {
      return errorResponse(
        "FORBIDDEN",
        "Only project owner can remove admin collaborators",
        403
      );
    }

    // Parse optional reason from query params
    const url = new URL(request.url);
    const reason = url.searchParams.get("reason") || undefined;

    // Remove collaborator
    const result = await removeCollaborator(
      collaboratorId,
      userId,
      access.isOwner ? "owner" : access.role,
      projectId,
      reason
    );

    if (!result.success) {
      return errorResponse("INTERNAL_ERROR", result.error || "Failed to remove collaborator", 500);
    }

    return successResponse({
      removed: true,
      collaboratorId,
      isSelfRemoval,
    });
  } catch (error) {
    console.error("Error removing collaborator:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to remove collaborator", 500);
  }
}
