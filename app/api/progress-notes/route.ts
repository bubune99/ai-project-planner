/**
 * Progress Notes API Routes
 *
 * GET /api/progress-notes - Get progress notes for a project
 * POST /api/progress-notes - Create a progress note (supports API key auth for agents)
 */

import { sql } from "@/lib/db/client";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils";

/**
 * GET /api/progress-notes
 * Get progress notes for a project
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const stepId = searchParams.get("stepId");
    const limit = Number.parseInt(searchParams.get("limit") || "50");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID required" },
        { status: 400 }
      );
    }

    // Verify user owns this project
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    let notes;
    if (stepId) {
      notes = await sql`
        SELECT * FROM progress_notes
        WHERE project_id = ${projectId}
          AND step_id = ${stepId}
          AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      notes = await sql`
        SELECT * FROM progress_notes
        WHERE project_id = ${projectId}
          AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({ notes });
  } catch (error: unknown) {
    console.error("Get progress notes error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to get progress notes", details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/progress-notes
 * Create a progress note
 *
 * This endpoint supports both session and API key authentication,
 * allowing external agents to log progress updates.
 *
 * Body:
 * - projectId: string (required) - Project to add note to
 * - stepId: string (optional) - Specific step this note relates to
 * - author_type: "human" | "agent" (required)
 * - author_name: string (required) - Name of the author/agent
 * - note_type: "progress" | "decision" | "blocker" | "note" (required)
 * - title: string (optional) - Note title
 * - content: string (required) - Note content
 * - metadata: object (optional) - Additional structured data
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const {
      projectId,
      stepId,
      author_type,
      author_name,
      note_type,
      title,
      content,
      metadata,
    } = body;

    // Validate required fields
    if (!projectId || !author_type || !author_name || !note_type || !content) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, author_type, author_name, note_type, content" },
        { status: 400 }
      );
    }

    // Validate author_type
    if (!["human", "agent"].includes(author_type)) {
      return NextResponse.json(
        { error: "Invalid author_type. Must be 'human' or 'agent'" },
        { status: 400 }
      );
    }

    // Validate note_type
    if (!["progress", "decision", "blocker", "note"].includes(note_type)) {
      return NextResponse.json(
        { error: "Invalid note_type. Must be 'progress', 'decision', 'blocker', or 'note'" },
        { status: 400 }
      );
    }

    // Verify user owns this project
    const hasAccess = await verifyProjectOwnership(projectId, userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // If stepId provided, verify it belongs to this project
    if (stepId) {
      const stepCheck = await sql`
        SELECT 1 FROM project_steps
        WHERE id = ${stepId} AND project_id = ${projectId}
      `;
      if (stepCheck.length === 0) {
        return NextResponse.json(
          { error: "Step not found in this project", code: "INVALID_STEP" },
          { status: 400 }
        );
      }
    }

    // Add auth metadata
    const enrichedMetadata = {
      ...(metadata || {}),
      authType,
      ...(authType === "api-key" && authContext.apiKeyId
        ? { apiKeyId: authContext.apiKeyId }
        : {}),
    };

    const result = await sql`
      INSERT INTO progress_notes (
        project_id,
        step_id,
        user_id,
        author_type,
        author_name,
        note_type,
        title,
        content,
        metadata
      ) VALUES (
        ${projectId},
        ${stepId || null},
        ${userId},
        ${author_type},
        ${author_name},
        ${note_type},
        ${title || null},
        ${content},
        ${JSON.stringify(enrichedMetadata)}::jsonb
      )
      RETURNING *
    `;

    // Log to execution history for significant notes
    if (note_type === "progress" || note_type === "decision" || note_type === "blocker") {
      await sql`
        INSERT INTO execution_history (
          project_id,
          user_id,
          event_type,
          description,
          new_value
        ) VALUES (
          ${projectId},
          ${userId},
          'progress_note_added',
          ${`${author_name} added ${note_type} note${title ? `: ${title}` : ''}`},
          ${JSON.stringify({
            noteId: result[0].id,
            noteType: note_type,
            authorType: author_type,
            authorName: author_name,
            stepId: stepId || null,
          })}::jsonb
        )
      `.catch((err) => console.error("Failed to log execution history:", err));
    }

    return NextResponse.json({
      success: true,
      note: result[0],
      authType, // Inform caller which auth method was used
    });
  } catch (error: unknown) {
    console.error("Create progress note error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create progress note", details: message },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
export const dynamic = "force-dynamic";
