/**
 * Project Step API Routes
 *
 * GET /api/projects/[id]/steps/[stepId] - Get step details
 * PATCH /api/projects/[id]/steps/[stepId] - Update step (supports API key auth for agents)
 * DELETE /api/projects/[id]/steps/[stepId] - Delete step
 */

import { sendIfMoved, withdrawIfMoved, withdrawNow } from "@/lib/work/send";
import type { WorkRow } from "@/lib/work/pipeline";
import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils";
import { isUuid, notAnId } from "@/lib/api/ids";

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/steps/[stepId]
 * Get step details with dependencies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id: projectId, stepId } = await params;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });
    if (!isUuid(stepId)) return NextResponse.json({ error: "Step not found" }, { status: 404 });

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const stepResult = await sql`
      SELECT
        ps.*,
        COALESCE(
          json_agg(
            json_build_object('depends_on_step_id', sd.depends_on_step_id, 'dependency_type', sd.dependency_type)
          ) FILTER (WHERE sd.id IS NOT NULL),
          '[]'::json
        ) as dependencies
      FROM project_steps ps
      LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
      WHERE ps.id = ${stepId}
        AND ps.project_id = ${projectId}
        AND ps.deleted_at IS NULL
      GROUP BY ps.id
    `;

    if (stepResult.length === 0) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ step: stepResult[0] });
  } catch (error: unknown) {
    console.error("Error fetching step:", error);
    return NextResponse.json(
      { error: "Failed to fetch step" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]/steps/[stepId]
 * Update step details
 *
 * This endpoint supports both session and API key authentication,
 * allowing external agents to update task status.
 *
 * Body (all optional):
 * - title: string
 * - description: string
 * - status: "pending" | "in-progress" | "completed" | "blocked"
 * - phase: string
 * - stage: string
 * - estimated_hours: number
 * - actual_hours: number
 * - assigned_agent: string
 * - priority: string
 * - tasks: array
 * - acceptance_criteria: array
 * - progress: number (0-100)
 * - version_id: string
 * - metadata: object
 * - dependencies: array
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    // Get authenticated user (supports both session and API key)
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId, authType } = authContext;
    const { id: projectId, stepId } = await params;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });
    if (!isUuid(stepId)) return NextResponse.json({ error: "Step not found" }, { status: 404 });

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    // Viewers are read-only: writes need owner/editor/admin.
    if (!(await verifyProjectWriteAccess(projectId, userId))) {
      return NextResponse.json(
        { error: "You have view-only access to this project", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      status: rawStatus,
      phase,
      stage,
      estimated_hours,
      actual_hours,
      tasks,
      acceptance_criteria,
      progress,
      version_id,
      metadata,
      dependencies,
    } = body;

    if (version_id && !isUuid(version_id)) return NextResponse.json({ error: notAnId("version_id") }, { status: 400 });
    // Validate status: built-in values or a custom project status key
    const VALID_STATUSES = ["requested", "pending", "in-progress", "completed", "blocked", "paused", "failed", "closed"];
    const status = rawStatus === "review" ? "in-progress" : rawStatus; // legacy clients sent "review"
    let statusKind: string | null = null;
    if (status) {
      const [kindRow] = await sql`SELECT step_status_kind(${projectId}::uuid, ${status}) AS kind`;
      statusKind = kindRow?.kind ?? null;
      if (!VALID_STATUSES.includes(status)) {
        const custom = await sql`
          SELECT 1 FROM project_statuses
          WHERE project_id = ${projectId} AND key = ${status} AND deleted_at IS NULL
        `;
        if (custom.length === 0) {
          return NextResponse.json(
            { error: `Invalid status: ${rawStatus}. Use a built-in status or a key from /statuses` },
            { status: 400 }
          );
        }
      }
    }
    // Urgent is a stored level (migration 056) and the board shows it; refusing it here meant no card could be set to it.
    const rawPriority = body.priority === "critical" ? "urgent" : body.priority;
    if (rawPriority != null && !["low", "medium", "high", "urgent"].includes(rawPriority)) {
      return NextResponse.json(
        { error: `Invalid priority: ${body.priority}. Allowed: low, medium, high, urgent` },
        { status: 400 }
      );
    }

    // Fields that support explicit clearing: pass null in the body to unset them.
    // (COALESCE alone can't distinguish "not provided" from "set to null".)
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const setPriority = has("priority");
    const setAgent = has("assigned_agent");
    const setStart = has("start_date");
    const setEnd = has("end_date");
    const setOrder = has("order_index") && Number.isInteger(body.order_index);
    const setTags = has("tags") && Array.isArray(body.tags);
    const tags = setTags ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 20) : null;

    // A card's kind: task, initiative (holds tasks) or upkeep (an agent's maintenance). Migration 071.
    const workKind = has("work_kind") ? body.work_kind : null;
    if (workKind !== null && !["task", "initiative", "upkeep", "owner"].includes(workKind)) {
      return NextResponse.json({ error: `Invalid work_kind: ${workKind}. Allowed: task, initiative, upkeep, owner` }, { status: 400 });
    }
    // An agent taking a card names itself, so the board shows who holds it (only an agent's key may claim).
    const claimedBy = authType !== "session" && typeof body.claimed_by === "string" && body.claimed_by.trim() ? body.claimed_by.trim().slice(0, 80) : null;
    // Where the card was, so a move into Up next or In progress can send it to an agent (lib/work/pipeline.ts).
    const [before] = (await sql`SELECT status, work_kind FROM project_steps WHERE id = ${stepId} AND project_id = ${projectId} AND deleted_at IS NULL`) as { status: string; work_kind: string | null }[];
    // An initiative holds tasks; its tasks are worked, so it is never in progress itself (owner, 2026-11-16).
    if (before && (workKind ?? before.work_kind) === "initiative" && (status ?? before.status) === "in-progress") {
      return NextResponse.json({ error: "An initiative is never in progress itself: move one of its tasks instead" }, { status: 400 });
    }

    const result = await sql`
      UPDATE project_steps
      SET
        title = COALESCE(${title || null}, title),
        description = COALESCE(${description || null}, description),
        status = COALESCE(${status || null}, status),
        phase = COALESCE(${phase || null}, phase),
        stage = COALESCE(${stage || null}, stage),
        estimated_hours = COALESCE(${estimated_hours ?? null}, estimated_hours),
        actual_hours = COALESCE(${actual_hours ?? null}, actual_hours),
        assigned_agent = CASE WHEN ${setAgent} THEN ${body.assigned_agent ?? null} ELSE assigned_agent END,
        priority = CASE WHEN ${setPriority} THEN ${rawPriority ?? null} ELSE priority END,
        start_date = CASE WHEN ${setStart} THEN ${body.start_date ?? null}::timestamp ELSE start_date END,
        end_date = CASE WHEN ${setEnd} THEN ${body.end_date ?? null}::timestamp ELSE end_date END,
        order_index = CASE WHEN ${setOrder} THEN ${setOrder ? body.order_index : null}::integer ELSE order_index END,
        tags = CASE WHEN ${setTags} THEN ${tags}::text[] ELSE tags END,
        tasks = COALESCE(${tasks ? JSON.stringify(tasks) : null}::jsonb, tasks),
        acceptance_criteria = COALESCE(${acceptance_criteria ? JSON.stringify(acceptance_criteria) : null}::jsonb, acceptance_criteria),
        progress = COALESCE(${progress ?? null}, progress),
        version_id = COALESCE(${version_id || null}, version_id),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata),
        work_kind = COALESCE(${workKind}, work_kind),
        claimed_by_id = CASE WHEN ${status || null}::text = 'in-progress' AND ${claimedBy}::text IS NOT NULL THEN ${claimedBy}
                             WHEN ${status || null}::text IS NOT NULL AND ${status || null}::text <> 'in-progress' THEN NULL ELSE claimed_by_id END,
        claimed_by_type = CASE WHEN ${status || null}::text = 'in-progress' AND ${claimedBy}::text IS NOT NULL THEN 'agent'
                               WHEN ${status || null}::text IS NOT NULL AND ${status || null}::text <> 'in-progress' THEN NULL ELSE claimed_by_type END,
        claimed_at = CASE WHEN ${status || null}::text = 'in-progress' AND ${claimedBy}::text IS NOT NULL THEN COALESCE(claimed_at, NOW())
                          WHEN ${status || null}::text IS NOT NULL AND ${status || null}::text <> 'in-progress' THEN NULL ELSE claimed_at END,
        updated_at = NOW(),
        completed_at = CASE WHEN ${statusKind === "done"} THEN NOW()
                            WHEN ${statusKind !== null && statusKind !== "done"} THEN NULL
                            ELSE completed_at END
      WHERE id = ${stepId}
        AND project_id = ${projectId}
        AND deleted_at IS NULL
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }

    const step = result[0];

    // Owner, 2026-11-16: dragging a card in "should be able to kick you and any of the other agents off to start
    // working". Only the owner's own moves send work; an agent moving its cards does not wake the others.
    // In progress only while an agent holds it, so moving a card out of it (above) lets go of it.
    if (status && authType === "session" && before && before.status !== status) {
      try {
        const jobId = await sendIfMoved(step as WorkRow, before.status, projectId, userId);
        if (jobId) step.sent_job_id = jobId;
      } catch (e) {
        console.error("sending the card to the agents failed", e);
        step.send_error = "The card moved, but it could not be sent to the agents. Move it again to retry.";
      }
    }
    // Whoever moves it: a card taken off the line (Requests, Paused, Complete, Closed) withdraws a job nobody picked up.
    if (status && before && before.status !== status) {
      try { await withdrawIfMoved(stepId, before.status, status) } catch (e) { console.error("withdrawing the card's job failed", e) }
    }

    // Update dependencies if provided
    if (dependencies !== undefined && Array.isArray(dependencies)) {
      // Remove old dependencies
      await sql`
        DELETE FROM step_dependencies WHERE step_id = ${stepId}
      `;

      // Add new dependencies
      for (const dep of dependencies) {
        if (dep.depends_on_step_id) {
          await sql`
            INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
            VALUES (${stepId}, ${dep.depends_on_step_id}, ${dep.dependency_type || "hard"})
          `;
        }
      }
    }

    // Log the update
    await sql`
      INSERT INTO execution_history (
        project_id,
        step_id,
        user_id,
        event_type,
        description,
        new_value
      )
      VALUES (
        ${projectId},
        ${stepId},
        ${userId},
        'step_updated',
        ${`Step updated: ${step.title}${status ? ` (status: ${status})` : ""}`},
        ${JSON.stringify({
          ...body,
          authType,
          ...(authType === "api-key" && authContext.apiKeyId
            ? { apiKeyId: authContext.apiKeyId }
            : {}),
        })}::jsonb
      )
    `.catch((err) => console.error("Failed to log execution history:", err));

    return NextResponse.json({
      step,
      authType, // Inform caller which auth method was used
    });
  } catch (error: unknown) {
    console.error("Error updating step:", error);
    return NextResponse.json(
      { error: "Failed to update step" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/steps/[stepId]
 * Soft delete a step
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    // Get authenticated user
    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { userId } = authContext;
    const { id: projectId, stepId } = await params;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });
    if (!isUuid(stepId)) return NextResponse.json({ error: "Step not found" }, { status: 404 });

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    // Viewers are read-only: writes need owner/editor/admin.
    if (!(await verifyProjectWriteAccess(projectId, userId))) {
      return NextResponse.json(
        { error: "You have view-only access to this project", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Soft delete
    const result = await sql`
      UPDATE project_steps
      SET deleted_at = NOW()
      WHERE id = ${stepId}
        AND project_id = ${projectId}
        AND deleted_at IS NULL
      RETURNING *
    `;
    if (result.length) {
      try { await withdrawNow(stepId, "the card was deleted") } catch (e) { console.error("withdrawing the deleted card's job failed", e) }
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Step not found" },
        { status: 404 }
      );
    }

    const step = result[0];

    // Log the deletion
    await sql`
      INSERT INTO execution_history (
        project_id,
        step_id,
        user_id,
        event_type,
        description
      )
      VALUES (
        ${projectId},
        ${stepId},
        ${userId},
        'step_deleted',
        ${`Step deleted: ${step.title}`}
      )
    `.catch((err) => console.error("Failed to log execution history:", err));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting step:", error);
    return NextResponse.json(
      { error: "Failed to delete step" },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
