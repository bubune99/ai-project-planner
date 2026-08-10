/**
 * PATCH  /api/projects/[id]/statuses/[statusId] — update label/color/kind/order_index
 * DELETE /api/projects/[id]/statuses/[statusId] — soft-delete; steps in this
 *         status are reassigned to ?reassign_to=<key> (default: 'pending')
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

const VALID_KINDS = ["open", "active", "done", "closed"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, statusId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
    const color = typeof body.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(body.color) ? body.color : null;
    const kind = VALID_KINDS.includes(body.kind) ? body.kind : null;
    const orderIndex = Number.isInteger(body.order_index) ? body.order_index : null;

    const [status] = await sql`
      UPDATE project_statuses
      SET label = COALESCE(${label}, label),
          color = COALESCE(${color}, color),
          kind = COALESCE(${kind}, kind),
          order_index = COALESCE(${orderIndex}::integer, order_index),
          updated_at = NOW()
      WHERE id = ${statusId} AND project_id = ${projectId} AND deleted_at IS NULL
      RETURNING id, key, label, color, order_index, kind
    `;
    if (!status) return NextResponse.json({ error: "Status not found" }, { status: 404 });
    return NextResponse.json({ status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to update status", details: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, statusId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const reassignTo = new URL(request.url).searchParams.get("reassign_to") || "pending";

    const [deleted] = await sql`
      UPDATE project_statuses SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${statusId} AND project_id = ${projectId} AND deleted_at IS NULL
      RETURNING key
    `;
    if (!deleted) return NextResponse.json({ error: "Status not found" }, { status: 404 });

    const moved = await sql`
      UPDATE project_steps SET status = ${reassignTo}, updated_at = NOW()
      WHERE project_id = ${projectId} AND status = ${deleted.key} AND deleted_at IS NULL
      RETURNING id
    `;
    return NextResponse.json({ success: true, reassigned: moved.length, reassigned_to: reassignTo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to delete status", details: message }, { status: 500 });
  }
}
