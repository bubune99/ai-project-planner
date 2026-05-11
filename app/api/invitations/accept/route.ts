import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { acceptInvitation, validateInvitation } from "@/lib/collaboration";

export const dynamic = "force-dynamic"

/**
 * POST /api/invitations/accept
 * Accept an invitation and become a collaborator
 *
 * Body: { token: string }
 *
 * Requires authentication. The accepting user must be logged in.
 * For email invitations, the user's email must match the invited email.
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse(
        "UNAUTHORIZED",
        "You must be logged in to accept an invitation",
        401
      );
    }

    const { userId } = authContext;

    // Parse request body
    const body = await request.json();
    const { token } = body as { token?: string };

    if (!token) {
      return errorResponse("VALIDATION_ERROR", "Invitation token is required", 400);
    }

    // Get user's email from database
    const userResult = await sql`
      SELECT email FROM users WHERE id = ${userId}
    `;

    if (userResult.length === 0) {
      return errorResponse("INTERNAL_ERROR", "User not found", 500);
    }

    const userEmail = userResult[0].email;

    // Get request metadata for logging
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                      request.headers.get("x-real-ip") ||
                      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    // Accept the invitation
    const result = await acceptInvitation(token, userId, userEmail, ipAddress, userAgent);

    if (!result.success) {
      const statusCode =
        result.errorCode === "NOT_FOUND" ? 404 :
        result.errorCode === "EXPIRED" ? 410 :
        result.errorCode === "REVOKED" ? 410 :
        result.errorCode === "MAX_USES" ? 410 :
        result.errorCode === "ACCEPTED" ? 410 :
        result.errorCode === "EMAIL_MISMATCH" ? 403 :
        result.errorCode === "ALREADY_COLLABORATOR" ? 409 : 400;

      return errorResponse(
        result.errorCode || "INVALID_INVITATION",
        result.error || "Failed to accept invitation",
        statusCode
      );
    }

    return successResponse({
      success: true,
      projectId: result.projectId,
      projectName: result.projectName,
      role: result.role,
      collaboratorId: result.collaboratorId,
      message: `You are now a ${result.role} on "${result.projectName}"`,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to accept invitation", 500);
  }
}

/**
 * GET /api/invitations/accept
 * Check if the current user can accept a specific invitation
 *
 * Query params: ?token=xxx
 *
 * This is useful for the UI to check if the logged-in user
 * can accept an email invitation (email must match).
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse(
        "UNAUTHORIZED",
        "You must be logged in",
        401
      );
    }

    const { userId } = authContext;

    // Get token from query params
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return errorResponse("VALIDATION_ERROR", "Token query parameter is required", 400);
    }

    // Validate the invitation
    const validation = await validateInvitation(token);

    if (!validation.valid || !validation.invitation) {
      return successResponse({
        canAccept: false,
        reason: validation.error,
        errorCode: validation.errorCode,
      });
    }

    const inv = validation.invitation;

    // Get user's email
    const userResult = await sql`
      SELECT email FROM users WHERE id = ${userId}
    `;

    if (userResult.length === 0) {
      return errorResponse("INTERNAL_ERROR", "User not found", 500);
    }

    const userEmail = userResult[0].email;

    // For email invitations, check if email matches
    if (inv.invitationType === "email" && inv.inviteeEmail) {
      if (inv.inviteeEmail.toLowerCase() !== userEmail.toLowerCase()) {
        return successResponse({
          canAccept: false,
          reason: "This invitation was sent to a different email address",
          errorCode: "EMAIL_MISMATCH",
          expectedEmail: inv.inviteeEmail,
          yourEmail: userEmail,
        });
      }
    }

    // Check if user is already a collaborator
    const existingCollaborator = await sql`
      SELECT id, removed_at FROM project_collaborators
      WHERE project_id = ${inv.projectId} AND user_id = ${userId}
    `;

    if (existingCollaborator.length > 0 && existingCollaborator[0].removed_at === null) {
      return successResponse({
        canAccept: false,
        reason: "You are already a collaborator on this project",
        errorCode: "ALREADY_COLLABORATOR",
      });
    }

    // Check if user is the project owner
    const isOwner = await sql`
      SELECT 1 FROM projects WHERE id = ${inv.projectId} AND user_id = ${userId}
    `;

    if (isOwner.length > 0) {
      return successResponse({
        canAccept: false,
        reason: "You are the owner of this project",
        errorCode: "IS_OWNER",
      });
    }

    return successResponse({
      canAccept: true,
      projectName: inv.projectName,
      role: inv.role,
      inviterName: inv.inviterName,
    });
  } catch (error) {
    console.error("Error checking invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to check invitation", 500);
  }
}
