/**
 * PATCH /api/feedback/[id] — triage a feedback item (check off fixes).
 * Auth required. Setting status to fixed/wont_fix/duplicate stamps resolution.
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { mergeEnvelopeForPatch, envelopeForSql } from "@/lib/api/envelope-helpers";

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

    // Merge 5W+H envelope (non-fatal: feedback may lack project_id)
    const existingFeedback = await sql`SELECT documentation_5wh, project_id FROM feedback WHERE id = ${id}`;
    const mergeResult = mergeEnvelopeForPatch(
      existingFeedback[0]?.documentation_5wh,
      b,
      { userId: auth.userId, projectId: existingFeedback[0]?.project_id ?? undefined, agentId: undefined },
      {
        type: 'feedback',
        title: b.title || undefined,
        summary: b.comment || b.summary,
        rationale: b?.documentation_5wh?.why?.rationale || `Triage: status=${b.status || 'unchanged'} priority=${b.priority || 'unchanged'}`,
      }
    );
    const hasEnvelope = mergeResult.ok;

    const [updated] = await sql`
      UPDATE feedback SET
        status            = COALESCE(${b.status || null}, status),
        priority          = COALESCE(${b.priority || null}, priority),
        resolved_at       = CASE WHEN ${resolving} THEN NOW() ELSE resolved_at END,
        resolved_by       = CASE WHEN ${resolving} THEN ${auth.userId}::uuid ELSE resolved_by END,
        documentation_5wh = COALESCE(${hasEnvelope ? envelopeForSql(mergeResult.envelope) : null}::jsonb, documentation_5wh),
        updated_at        = NOW()
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
