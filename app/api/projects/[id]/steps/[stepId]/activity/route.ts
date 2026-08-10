/**
 * GET /api/projects/[id]/steps/[stepId]/activity
 * Activity timeline for a step, read from execution_history.
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, stepId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get("limit") || "50", 10) || 50, 200);
    const events = await sql`
      SELECT eh.id, eh.event_type, eh.description, eh.new_value, eh.created_at, u.name AS user_name
      FROM execution_history eh
      LEFT JOIN users u ON u.id = eh.user_id
      WHERE eh.project_id = ${projectId} AND eh.step_id = ${stepId}
      ORDER BY eh.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ events });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to list activity", details: message }, { status: 500 });
  }
}
