/**
 * Step time tracking.
 *
 * GET  — entries for this step + the caller's currently running entry (any step)
 * POST — { action: "start", note? }  starts a timer on this step, stopping any
 *                                    running one first
 *        { action: "stop" }          stops the caller's running timer on this
 *                                    step and rolls duration into actual_hours
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
    const entries = await sql`
      SELECT id, started_at, ended_at, note,
             EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))::int AS seconds
      FROM step_time_entries
      WHERE step_id = ${stepId}
      ORDER BY started_at DESC
      LIMIT 50
    `;
    const [running] = await sql`
      SELECT id, step_id, started_at FROM step_time_entries
      WHERE user_id = ${auth.userId} AND ended_at IS NULL
      LIMIT 1
    `;
    const [totals] = await sql`
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))), 0)::int AS total_seconds
      FROM step_time_entries WHERE step_id = ${stepId}
    `;
    return NextResponse.json({ entries, running: running || null, totalSeconds: totals.total_seconds });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to list time entries", details: message }, { status: 500 });
  }
}

export async function POST(
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
    const b = await request.json();

    if (b.action === "start") {
      // Stop any running entry first (unique index enforces one running per user)
      await sql`
        UPDATE step_time_entries SET ended_at = NOW()
        WHERE user_id = ${auth.userId} AND ended_at IS NULL
      `;
      const [entry] = await sql`
        INSERT INTO step_time_entries (step_id, project_id, user_id, note)
        VALUES (${stepId}, ${projectId}, ${auth.userId}, ${b.note || null})
        RETURNING id, step_id, started_at
      `;
      return NextResponse.json({ running: entry }, { status: 201 });
    }

    if (b.action === "stop") {
      const [entry] = await sql`
        UPDATE step_time_entries SET ended_at = NOW()
        WHERE user_id = ${auth.userId} AND step_id = ${stepId} AND ended_at IS NULL
        RETURNING id, EXTRACT(EPOCH FROM (ended_at - started_at))::int AS seconds
      `;
      if (!entry) return NextResponse.json({ error: "No running timer on this step" }, { status: 404 });
      // Roll tracked time into actual_hours so existing reports stay meaningful
      await sql`
        UPDATE project_steps
        SET actual_hours = actual_hours + ROUND((${entry.seconds}::numeric / 3600), 2), updated_at = NOW()
        WHERE id = ${stepId} AND project_id = ${projectId}
      `;
      return NextResponse.json({ stopped: entry });
    }

    return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to update timer", details: message }, { status: 500 });
  }
}
