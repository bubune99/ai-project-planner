/**
 * GET /api/projects/[id]/steps/[stepId]/channel
 * The two-way channel's messages about this card (work_messages, migration 082): finish claims, what was accepted
 * or sent back and why, requests and their answers, the next card handed on. Oldest first. Read-only; the same access
 * as the card's activity.
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, stepId } = await params;
    if (!UUID.test(projectId) || !UUID.test(stepId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const messages = await sql`
      SELECT id, agent, from_side, kind, body, status, reply_to, created_at, answered_at
        FROM work_messages
       WHERE project_id = ${projectId} AND step_id = ${stepId}
       ORDER BY created_at ASC
       LIMIT 200
    `;
    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error("channel GET failed", error);
    return NextResponse.json({ error: "Failed to list the channel" }, { status: 500 });
  }
}
