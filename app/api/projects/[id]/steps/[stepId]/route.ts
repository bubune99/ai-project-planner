/**
 * Project Step API Routes
 *
 * GET /api/projects/[id]/steps/[stepId] - Get step details
 * PATCH /api/projects/[id]/steps/[stepId] - Update step (supports API key auth for agents)
 * DELETE /api/projects/[id]/steps/[stepId] - Delete step
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch step", details: message },
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

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
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

    // Validate against the DB CHECK constraints up front (400 beats a 500 from Postgres)
    const VALID_STATUSES = ["pending", "in-progress", "completed", "blocked", "paused", "failed"];
    const status = rawStatus === "review" ? "in-progress" : rawStatus; // legacy clients sent "review", which the DB rejects
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${rawStatus}. Allowed: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const rawPriority = body.priority === "critical" ? "high" : body.priority;
    if (rawPriority != null && !["low", "medium", "high"].includes(rawPriority)) {
      return NextResponse.json(
        { error: `Invalid priority: ${body.priority}. Allowed: low, medium, high` },
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
        tasks = COALESCE(${tasks ? JSON.stringify(tasks) : null}::jsonb, tasks),
        acceptance_criteria = COALESCE(${acceptance_criteria ? JSON.stringify(acceptance_criteria) : null}::jsonb, acceptance_criteria),
        progress = COALESCE(${progress ?? null}, progress),
        version_id = COALESCE(${version_id || null}, version_id),
        metadata = COALESCE(${metadata ? JSON.stringify(metadata) : null}::jsonb, metadata),
        updated_at = NOW(),
        completed_at = CASE WHEN ${status} = 'completed' THEN NOW() ELSE completed_at END
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update step", details: message },
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

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to delete step", details: message },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
