/**
 * Project Steps API Routes
 *
 * GET /api/projects/[id]/steps - Get all steps for a project
 * POST /api/projects/[id]/steps - Create a new step
 */

import { type NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic"

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
        ) as dependencies
      FROM project_steps ps
      LEFT JOIN step_dependencies sd ON ps.id = sd.step_id
      WHERE ps.project_id = ${projectId}
        AND ps.deleted_at IS NULL
      GROUP BY ps.id
      ORDER BY ps.order_index ASC, ps.created_at ASC
    `;

    return NextResponse.json({ steps });
  } catch (error: unknown) {
    console.error("Error fetching steps:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch steps", details: message },
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
      phase,
      stage,
      estimated_hours,
      assigned_agent,
      priority = "medium",
      tasks = [],
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

    // Get the max order_index to append at the end
    const maxOrderResult = await sql`
      SELECT COALESCE(MAX(order_index), 0) as max_order
      FROM project_steps
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;

    const maxOrder = maxOrderResult[0]?.max_order || 0;

    // Create the step
    const result = await sql`
      INSERT INTO project_steps (
        project_id, title, description, phase, stage,
        estimated_hours, assigned_agent, priority, tasks,
        acceptance_criteria, version_id, metadata, order_index
      )
      VALUES (
        ${projectId}, ${title}, ${description || null}, ${phase || null}, ${stage || null},
        ${estimated_hours || null}, ${assigned_agent || null}, ${priority},
        ${JSON.stringify(tasks)}::jsonb,
        ${JSON.stringify(acceptance_criteria)}::jsonb, ${version_id || null},
        ${JSON.stringify(metadata)}::jsonb, ${maxOrder + 1}
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

    return NextResponse.json({ step }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating step:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create step", details: message },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
