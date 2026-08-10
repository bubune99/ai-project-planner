/**
 * POST /api/projects/[id]/steps/reorder
 * Persist a new manual ordering for a project's steps.
 *
 * Body:
 * - stepIds: string[]  (full or partial list; order = array position)
 *
 * Steps are renumbered 1..N by array position. IDs not owned by the
 * project are ignored by the WHERE clause.
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id: projectId } = await params;

    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { stepIds } = body;

    if (!Array.isArray(stepIds) || stepIds.length === 0 || stepIds.some((id) => typeof id !== "string")) {
      return NextResponse.json(
        { error: "stepIds must be a non-empty array of step IDs" },
        { status: 400 }
      );
    }
    if (stepIds.length > 500) {
      return NextResponse.json(
        { error: "Too many steps in one reorder request (max 500)" },
        { status: 400 }
      );
    }

    await sql`
      UPDATE project_steps AS ps
      SET order_index = ord.new_index, updated_at = NOW()
      FROM (
        SELECT id, ordinality AS new_index
        FROM unnest(${stepIds}::uuid[]) WITH ORDINALITY AS t(id, ordinality)
      ) AS ord
      WHERE ps.id = ord.id
        AND ps.project_id = ${projectId}
        AND ps.deleted_at IS NULL
    `;

    return NextResponse.json({ success: true, count: stepIds.length });
  } catch (error: unknown) {
    console.error("Error reordering steps:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to reorder steps", details: message },
      { status: 500 }
    );
  }
}
