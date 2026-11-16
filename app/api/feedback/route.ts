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
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { buildEnvelopeForWrite, envelopeForSql } from "@/lib/api/envelope-helpers";
import { reportCard, reportKind } from "@/lib/intake/report-card";

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
    kind: r.metadata?.kind ?? null,
    picked: r.metadata?.picked ?? null,
    stepId: r.metadata?.stepId ?? null,
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

    // Build 5W+H envelope (legacy mode, non-fatal). Feedback can arrive
    // unauthenticated, so fall back to a sentinel user. The column is NOT NULL
    // (default '{}'), and an explicit NULL in the INSERT overrides the default —
    // that combination silently killed every submission after migration 041.
    let envelopeSql: string | null = null;
    const envelopeResult = buildEnvelopeForWrite(
      b,
      { userId: auth?.userId || "anonymous", projectId: b.projectId || undefined, agentId: undefined },
      {
        type: 'feedback',
        title: b.title || b.comment?.slice(0, 80),
        summary: b.comment?.trim(),
        rationale: b?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    );
    if (envelopeResult.ok) {
      envelopeSql = envelopeForSql(envelopeResult.envelope);
    }

    const [created] = await sql`
      INSERT INTO feedback (
        source, project_id, url, route, selector, target_rect, annotations,
        title, comment, screenshot, env, commit_sha,
        reporter_user_id, reporter_name, reporter_email,
        documentation_5wh
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
        ${b.reporterEmail || null},
        COALESCE(${envelopeSql}::jsonb, '{}'::jsonb)
      )
      RETURNING id, created_at, status
    `;
    const card = await cardForReport(created.id, b);
    return successResponse({ id: created.id, status: created.status, card }, undefined, 201);
  } catch (e: any) {
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to save feedback", 500, e?.message);
  }
}

/**
 * Intake (lib/intake/report-card.ts): the report becomes a card on its app's project, wrong to Up next, wish to
 * Requests. A failure here never loses the report itself; it stays in the list and the error is logged.
 */
async function cardForReport(reportId: string, b: any): Promise<{ id: string; column: string } | null> {
  const kind = reportKind(b.kind);
  const picked = typeof b.picked === "string" ? b.picked.slice(0, 200) : null;
  try {
    const card = reportCard({
      id: reportId, source: b.source, kind, title: b.title, comment: b.comment, url: b.url, route: b.route,
      selector: b.selector, picked,
      screenshot: typeof b.screenshot === "string" && /^https?:\/\//.test(b.screenshot) ? b.screenshot : b.screenshot ? "kept" : null,
    });
    if (!card) {
      await sql`UPDATE feedback SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ kind, picked })}::jsonb WHERE id = ${reportId}`;
      return null;
    }
    const [step] = await sql`
      INSERT INTO project_steps (project_id, title, description, status, phase, stage, priority, order_index, tags, work_kind)
      VALUES (
        ${card.projectId}, ${card.title}, ${card.description}, ${card.status},
        COALESCE((SELECT NULLIF(current_phase, '') FROM projects WHERE id = ${card.projectId}), 'planning'),
        'backlog', ${card.priority},
        (SELECT COALESCE(MAX(order_index), 0) + 1 FROM project_steps WHERE project_id = ${card.projectId} AND deleted_at IS NULL),
        ${card.tags}::text[], 'task'
      )
      RETURNING id
    `;
    await sql`
      UPDATE feedback SET project_id = ${card.projectId},
             metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ kind, picked, stepId: step.id })}::jsonb
       WHERE id = ${reportId}
    `;
    return { id: step.id, column: card.status === "requested" ? "Requests" : "Up next" };
  } catch (e: any) {
    console.error("[feedback] report saved but its card was not made", reportId, e?.message);
    return null;
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
    // ?mine=1: only what this person sent (the inbox's My reports). Only the platform owner sees everyone's reports:
    // they carry screenshots and page addresses (2026-11-16, any signed-in user could read them all).
    const mine = u.searchParams.get("mine") === "1" || !isPlatformAdmin(auth.userId) ? auth.userId : null;

    const items = await sql`
      SELECT * FROM feedback
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${source}::text IS NULL OR source = ${source})
        AND (${mine}::text IS NULL OR reporter_user_id = ${mine})
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
      WHERE (${mine}::text IS NULL OR reporter_user_id = ${mine})
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
