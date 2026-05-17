/**
 * PATCH /api/feedback/[id] — triage a feedback item (check off fixes).
 * Auth required. Setting status to fixed/wont_fix/duplicate stamps resolution.
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

const STATUS = ["open", "in_progress", "fixed", "wont_fix", "duplicate"];
const PRIORITY = ["low", "normal", "high", "urgent"];

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext().catch(() => null);
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);

    const { id } = await ctx.params;
    const b = await request.json().catch(() => ({}));

    if (b.status && !STATUS.includes(b.status)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, `status must be one of ${STATUS.join(", ")}`, 400);
    }
    if (b.priority && !PRIORITY.includes(b.priority)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, `priority must be one of ${PRIORITY.join(", ")}`, 400);
    }
    if (!b.status && !b.priority) {
      return errorResponse(ErrorCodes.BAD_REQUEST, "Provide status and/or priority", 400);
    }

    const resolving = b.status && ["fixed", "wont_fix", "duplicate"].includes(b.status);

    const [updated] = await sql`
      UPDATE feedback SET
        status      = COALESCE(${b.status || null}, status),
        priority    = COALESCE(${b.priority || null}, priority),
        resolved_at = CASE WHEN ${resolving} THEN NOW() ELSE resolved_at END,
        resolved_by = CASE WHEN ${resolving} THEN ${auth.userId}::uuid ELSE resolved_by END,
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING id, status, priority, resolved_at
    `;
    if (!updated) return errorResponse(ErrorCodes.NOT_FOUND, "Feedback not found", 404);
    return successResponse({
      id: updated.id,
      status: updated.status,
      priority: updated.priority,
      resolvedAt: updated.resolved_at,
    });
  } catch (e: any) {
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to update feedback", 500, e?.message);
  }
}
