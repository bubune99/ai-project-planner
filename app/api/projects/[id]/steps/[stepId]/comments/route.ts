/**
 * Step comments (threaded).
 *
 * GET  — list comments for a step (flat, ordered; client threads by parent_comment_id)
 * POST — create { body, parent_comment_id? }
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
    const comments = await sql`
      SELECT c.id, c.parent_comment_id, c.body, c.user_id, c.author_label, c.created_at, c.updated_at,
             u.name AS user_name
      FROM step_comments c
      LEFT JOIN users u ON u.id::text = c.user_id
      WHERE c.step_id = ${stepId} AND c.project_id = ${projectId} AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `;
    return NextResponse.json({ comments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to list comments", details: message }, { status: 500 });
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
    const bodyText = (b.body || "").toString().trim();
    if (!bodyText) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const [comment] = await sql`
      INSERT INTO step_comments (step_id, project_id, user_id, parent_comment_id, body, author_label)
      VALUES (${stepId}, ${projectId}, ${auth.userId}, ${b.parent_comment_id || null},
              ${bodyText}, ${b.author_label || null})
      RETURNING id, parent_comment_id, body, user_id, author_label, created_at, updated_at
    `;
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to create comment", details: message }, { status: 500 });
  }
}
