/**
 * Project Steps API Routes
 *
 * GET /api/projects/[id]/steps - Get all steps for a project
 * POST /api/projects/[id]/steps - Create a new step
 */

import { sendIfMoved } from "@/lib/work/send";
import { withPartWaiting } from "@/lib/work/part-waiting";
import type { WorkRow } from "@/lib/work/pipeline";
import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils";
import { isUuid } from "@/lib/api/ids";
import { databaseUnavailableResponse } from "@/lib/db/unavailable";

export const dynamic = "force-dynamic"

// Must mirror the project_steps_status_check / priority CHECK constraints
const VALID_STATUSES = ["requested", "pending", "in-progress", "completed", "blocked", "paused", "failed", "closed"];
// "urgent" added by migration 056 so tasks can express the same urgency
// todos always could. Before that, urgent project work literally had no
// valid task priority, which pushed it into the todo list instead.
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];

/**
 * GET /api/projects/[id]/steps
 * Get all steps for a project with dependencies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const { id: projectId } = await params;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

    // Verify project ownership
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const steps = await sql`
      SELECT
        ps.*,
        COALESCE(
          json_agg(
            json_build_object('depends_on_step_id', sd.depends_on_step_id, 'dependency_type', sd.dependency_type)
          ) FILTER (WHERE sd.id IS NOT NULL),
          '[]'::json
        ) as dependencies,
        -- Started and waiting for an agent to take it: the card says so (walk 2026-11-17).
        EXISTS (SELECT 1 FROM agent_jobs j WHERE j.parent_step_id = ps.id AND j.status IN ('pending', 'queued', 'assigned')) AS in_line
      FROM project_steps ps
      LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
      WHERE ps.project_id = ${projectId}
        AND ps.deleted_at IS NULL
      GROUP BY ps.id
      ORDER BY ps.order_index ASC, ps.created_at ASC
    `;

    // Shipped with a part waiting on the caller's answer: read from the card's records, never stored (card 2f95e84a).
    return NextResponse.json({ steps: await withPartWaiting(userId, steps as { id: string; project_id: string }[]) });
  } catch (error: unknown) {
    const down = databaseUnavailableResponse(error);
    if (down) return down;
    console.error("Error fetching steps:", error);
    return NextResponse.json(
      { error: "Failed to fetch steps" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/steps
 * Create a new step
 *
 * Body:
 * - title: string (required)
 * - description: string (optional)
 * - phase: string (optional)
 * - stage: string (optional)
 * - estimated_hours: number (optional)
 * - assigned_agent: string (optional)
 * - priority: "low" | "medium" | "high" | "critical" (optional, default: "medium")
 * - tasks: array (optional)
 * - acceptance_criteria: object (optional)
 * - dependencies: array (optional)
 * - version_id: string (optional)
 * - metadata: object (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { userId, authType } = authContext;
    const { id: projectId } = await params;
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

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
      phase,
      stage,
      estimated_hours,
      assigned_agent,
      priority: rawPriority = "medium",
      status: rawStatus = "pending",
      start_date,
      end_date,
      parent_task_id,
      tasks: stepTasks = [],
      acceptance_criteria = {},
      dependencies = [],
      version_id,
      metadata = {},
    } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    // "critical" predates the DB constraint (low/medium/high) — fold it into high
    const priority = rawPriority === "critical" ? "high" : rawPriority;
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { error: `Invalid priority: ${rawPriority}. Allowed: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 }
      );
    }
    const status = rawStatus;
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
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 20)
      : [];

    // Get the max order_index to append at the end
    const maxOrderResult = await sql`
      SELECT COALESCE(MAX(order_index), 0) as max_order
      FROM project_steps
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;

    const maxOrder = maxOrderResult[0]?.max_order || 0;

    // Who made the card (owner, 2026-11-19): the owner's own session, unless an API key made it or an agent working
    // through the owner's tab said so with agent: true.
    const viaKey = (request.headers.get("authorization") ?? "").startsWith("Bearer ") || !!request.headers.get("x-api-key");
    const createdBy = viaKey || body.agent === true ? "agent" : "owner";

    // Create the step
    const result = await sql`
      INSERT INTO project_steps (
        project_id, title, description, status, phase, stage,
        estimated_hours, assigned_agent, priority, tasks,
        acceptance_criteria, version_id, metadata, order_index,
        start_date, end_date, parent_task_id, tags, created_by
      )
      VALUES (
        ${projectId}, ${title}, ${description || ""}, ${status},
        -- phase/stage are NOT NULL; writing "" dumped every step into an
        -- unnamed bucket and made the Roadmap view empty-looking.
        COALESCE(
          NULLIF(${phase || ""}, ''),
          (SELECT NULLIF(current_phase, '') FROM projects WHERE id = ${projectId}),
          'planning'
        ),
        ${stage || "backlog"},
        ${estimated_hours ?? 0}, ${assigned_agent || null}, ${priority},
        ${JSON.stringify(stepTasks)}::jsonb,
        ${JSON.stringify(acceptance_criteria)}::jsonb, ${version_id || null},
        ${JSON.stringify(metadata)}::jsonb, ${maxOrder + 1},
        ${start_date || null}, ${end_date || null}, ${parent_task_id || null}, ${tags}::text[], ${createdBy}
      )
      RETURNING *
    `;

    const step = result[0];

    // Add dependencies if provided
    if (dependencies.length > 0) {
      for (const dep of dependencies) {
        if (dep.depends_on_step_id) {
          await sql`
            INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type)
            VALUES (${step.id}, ${dep.depends_on_step_id}, ${dep.dependency_type || "hard"})
          `;
        }
      }
    }

    // Log the creation
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
        ${step.id},
        ${userId},
        'step_created',
        ${`Step created: ${title}`},
        ${JSON.stringify({
          step_id: step.id,
          title,
          authType,
        })}::jsonb
      )
    `.catch((err) => console.error("Failed to log execution history:", err));

    // A card the owner makes straight into Up next or In progress is sent to an agent, as if moved there.
    if (authType === "session") {
      try { const jobId = await sendIfMoved(step as WorkRow, null, projectId, userId); if (jobId) step.sent_job_id = jobId }
      catch (e) { console.error("sending the new card to the agents failed", e); step.send_error = "The card was made, but it could not be sent to the agents. Move it to retry." }
    }
    return NextResponse.json({ step }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating step:", error);
    return NextResponse.json(
      { error: "Failed to create step" },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
