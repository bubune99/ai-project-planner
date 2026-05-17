/**
 * Feedback collector.
 *
 * POST  — create feedback. Intentionally NOT auth-gated: the widget is meant
 *         to be embeddable in any app (incl. unauthenticated end users). If a
 *         planner session exists we attribute reporter_user_id.
 * GET   — admin list (auth required). Filters: status, source, limit.
 *         meta.openCount drives the admin notification badge.
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic";

function row(r: any) {
  return {
    id: r.id,
    source: r.source,
    projectId: r.project_id,
    url: r.url,
    route: r.route,
    selector: r.selector,
    targetRect: r.target_rect,
    annotations: r.annotations,
    title: r.title,
    comment: r.comment,
    screenshot: r.screenshot,
    env: r.env,
    commitSha: r.commit_sha,
    status: r.status,
    priority: r.priority,
    reporterName: r.reporter_name,
    reporterEmail: r.reporter_email,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
  };
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json().catch(() => null);
    if (!b || typeof b.comment !== "string" || !b.comment.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, "comment is required", 400);
    }
    if (typeof b.url !== "string" || !b.url) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, "url is required", 400);
    }

    const auth = await getAuthContext().catch(() => null);

    const [created] = await sql`
      INSERT INTO feedback (
        source, project_id, url, route, selector, target_rect, annotations,
        title, comment, screenshot, env, commit_sha,
        reporter_user_id, reporter_name, reporter_email
      ) VALUES (
        ${b.source || "unknown"},
        ${b.projectId || null},
        ${b.url},
        ${b.route || null},
        ${b.selector || null},
        ${b.targetRect ? JSON.stringify(b.targetRect) : null}::jsonb,
        ${JSON.stringify(Array.isArray(b.annotations) ? b.annotations : [])}::jsonb,
        ${b.title || null},
        ${b.comment.trim()},
        ${b.screenshot || null},
        ${JSON.stringify(b.env || {})}::jsonb,
        ${b.commitSha || null},
        ${auth?.userId || null},
        ${b.reporterName || null},
        ${b.reporterEmail || null}
      )
      RETURNING id, created_at, status
    `;
    return successResponse({ id: created.id, status: created.status }, undefined, 201);
  } catch (e: any) {
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to save feedback", 500, e?.message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext().catch(() => null);
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);

    const u = new URL(request.url);
    const status = u.searchParams.get("status");
    const source = u.searchParams.get("source");
    const limit = Math.min(parseInt(u.searchParams.get("limit") || "100", 10) || 100, 200);

    const items = await sql`
      SELECT * FROM feedback
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${source}::text IS NULL OR source = ${source})
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ${limit}
    `;
    const [counts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int        AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*)::int                                        AS total
      FROM feedback
    `;
    return successResponse(items.map(row), {
      total: counts.total,
      openCount: counts.open,
      inProgressCount: counts.in_progress,
    } as any);
  } catch (e: any) {
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to list feedback", 500, e?.message);
  }
}
