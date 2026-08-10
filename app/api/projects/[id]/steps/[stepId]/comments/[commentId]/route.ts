/**
 * PATCH  — edit own comment { body }
 * DELETE — soft-delete own comment
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string; commentId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, stepId, commentId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const b = await request.json();
    const bodyText = (b.body || "").toString().trim();
    if (!bodyText) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const [comment] = await sql`
      UPDATE step_comments SET body = ${bodyText}, updated_at = NOW()
      WHERE id = ${commentId} AND step_id = ${stepId} AND user_id = ${auth.userId} AND deleted_at IS NULL
      RETURNING id, parent_comment_id, body, user_id, author_label, created_at, updated_at
    `;
    if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    return NextResponse.json({ comment });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to update comment", details: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string; commentId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, stepId, commentId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const [deleted] = await sql`
      UPDATE step_comments SET deleted_at = NOW()
      WHERE id = ${commentId} AND step_id = ${stepId} AND user_id = ${auth.userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (!deleted) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to delete comment", details: message }, { status: 500 });
  }
}
