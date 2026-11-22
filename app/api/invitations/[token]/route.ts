import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { validateInvitation } from "@/lib/collaboration";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { PUBLIC_ROUTE_LIMITS, publicLimitKey } from "@/lib/public-route-limits";

export const dynamic = "force-dynamic"

/**
 * GET /api/invitations/[token]
 * Get invitation details (public endpoint)
 *
 * This endpoint does not require authentication.
 * It returns basic invitation info for the acceptance page.
 *
 * Declared public in security.config.json: the long random token is the key. Each address may look
 * invitations up 30 times a minute, far more than a person opening a link needs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { limit, windowMs } = PUBLIC_ROUTE_LIMITS.invitation;
    if (!(await checkRateLimit(publicLimitKey("invitation", clientIp(request)), limit, windowMs))) {
      return errorResponse("RATE_LIMITED", "Too many invitation lookups from this address. Try again in a minute.", 429);
    }

    const { token } = await params;

    if (!token) {
      return errorResponse("VALIDATION_ERROR", "Invitation token is required", 400);
    }

    // Validate the invitation
    const validation = await validateInvitation(token);

    if (!validation.valid || !validation.invitation) {
      const statusCode =
        validation.errorCode === "NOT_FOUND" ? 404 :
        validation.errorCode === "EXPIRED" ? 410 :
        validation.errorCode === "REVOKED" ? 410 :
        validation.errorCode === "MAX_USES" ? 410 :
        validation.errorCode === "ACCEPTED" ? 410 : 400;

      return errorResponse(
        validation.errorCode || "INVALID_INVITATION",
        validation.error || "Invalid invitation",
        statusCode
      );
    }

    const inv = validation.invitation;

    // Return public-safe information only
    return successResponse({
      valid: true,
      projectName: inv.projectName,
      role: inv.role,
      inviterName: inv.inviterName,
      invitationType: inv.invitationType,
      expiresAt: inv.expiresAt,
      // For email invitations, show the expected email
      expectedEmail: inv.invitationType === "email" ? inv.inviteeEmail : undefined,
      message: inv.message,
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch invitation", 500);
  }
}
