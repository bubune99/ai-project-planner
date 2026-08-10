/**
 * Project status pipeline (custom kanban columns).
 *
 * GET  /api/projects/[id]/statuses  — list custom statuses (empty = project
 *                                     uses the six built-in statuses)
 * POST /api/projects/[id]/statuses  — create one { key?, label, color?, kind?, order_index? }
 *                                     (key derived from label when omitted)
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

const VALID_KINDS = ["open", "active", "done", "closed"];

function slugifyStatusKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const statuses = await sql`
      SELECT id, key, label, color, order_index, kind
      FROM project_statuses
      WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY order_index ASC, created_at ASC
    `;
    return NextResponse.json({ statuses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to list statuses", details: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId } = await params;
    if (!(await verifyProjectOwnership(projectId, auth.userId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const label = (body.label || "").toString().trim();
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
    const key = slugifyStatusKey(body.key || label);
    if (!key) return NextResponse.json({ error: "could not derive a key from label" }, { status: 400 });
    const kind = VALID_KINDS.includes(body.kind) ? body.kind : "open";
    const color = typeof body.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(body.color)
      ? body.color
      : "#87909e";

    const [maxRow] = await sql`
      SELECT COALESCE(MAX(order_index), -1) AS max_order
      FROM project_statuses WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;
    const orderIndex = Number.isInteger(body.order_index) ? body.order_index : (maxRow.max_order ?? -1) + 1;

    const [status] = await sql`
      INSERT INTO project_statuses (project_id, key, label, color, order_index, kind)
      VALUES (${projectId}, ${key}, ${label}, ${color}, ${orderIndex}, ${kind})
      ON CONFLICT (project_id, key) DO UPDATE
        SET label = EXCLUDED.label, color = EXCLUDED.color, kind = EXCLUDED.kind,
            deleted_at = NULL, updated_at = NOW()
      RETURNING id, key, label, color, order_index, kind
    `;
    return NextResponse.json({ status }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to create status", details: message }, { status: 500 });
  }
}
