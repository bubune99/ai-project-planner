import { NextRequest } from "next/server";
import { sql } from "@/lib/db/client";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getProjectAccess } from "@/lib/auth/collaboration-access";
import type { CollaborationActionType } from "@/lib/db/schema";

export const dynamic = "force-dynamic"

/**
 * GET /api/projects/[id]/activity
 * Get the activity log for a project
 *
 * Query params:
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 * - actionType: CollaborationActionType (filter by action type)
 * - actorId: string (filter by actor)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getAuthContext();
    if (!authContext) {
      return errorResponse("UNAUTHORIZED", "Authentication required", 401);
    }

    const { userId } = authContext;
    const { id: projectId } = await params;

    // Get user's access level - all collaborators can view activity
    const access = await getProjectAccess(projectId, userId);
    if (!access) {
      return errorResponse("NOT_FOUND", "Project not found", 404);
    }

    // Parse query params
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const actionType = url.searchParams.get("actionType") as CollaborationActionType | null;
    const actorId = url.searchParams.get("actorId");

    // Build base query
    let activities;
    let totalCount;

    if (actionType && actorId) {
      // Filter by both action type and actor
      activities = await sql`
        SELECT
          cal.id,
          cal.action_type,
          cal.actor_role,
          cal.target_type,
          cal.target_id,
          cal.description,
          cal.old_value,
          cal.new_value,
          cal.metadata,
          cal.created_at,
          u.id as actor_id,
          u.name as actor_name,
          u.email as actor_email,
          u.avatar_url as actor_avatar_url
        FROM collaboration_activity_log cal
        JOIN users u ON cal.actor_id = u.id
        WHERE cal.project_id = ${projectId}
          AND cal.action_type = ${actionType}
          AND cal.actor_id = ${actorId}
        ORDER BY cal.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const countResult = await sql`
        SELECT COUNT(*) as count FROM collaboration_activity_log
        WHERE project_id = ${projectId}
          AND action_type = ${actionType}
          AND actor_id = ${actorId}
      `;
      totalCount = parseInt(countResult[0].count, 10);
    } else if (actionType) {
      // Filter by action type only
      activities = await sql`
        SELECT
          cal.id,
          cal.action_type,
          cal.actor_role,
          cal.target_type,
          cal.target_id,
          cal.description,
          cal.old_value,
          cal.new_value,
          cal.metadata,
          cal.created_at,
          u.id as actor_id,
          u.name as actor_name,
          u.email as actor_email,
          u.avatar_url as actor_avatar_url
        FROM collaboration_activity_log cal
        JOIN users u ON cal.actor_id = u.id
        WHERE cal.project_id = ${projectId}
          AND cal.action_type = ${actionType}
        ORDER BY cal.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const countResult = await sql`
        SELECT COUNT(*) as count FROM collaboration_activity_log
        WHERE project_id = ${projectId}
          AND action_type = ${actionType}
      `;
      totalCount = parseInt(countResult[0].count, 10);
    } else if (actorId) {
      // Filter by actor only
      activities = await sql`
        SELECT
          cal.id,
          cal.action_type,
          cal.actor_role,
          cal.target_type,
          cal.target_id,
          cal.description,
          cal.old_value,
          cal.new_value,
          cal.metadata,
          cal.created_at,
          u.id as actor_id,
          u.name as actor_name,
          u.email as actor_email,
          u.avatar_url as actor_avatar_url
        FROM collaboration_activity_log cal
        JOIN users u ON cal.actor_id = u.id
        WHERE cal.project_id = ${projectId}
          AND cal.actor_id = ${actorId}
        ORDER BY cal.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const countResult = await sql`
        SELECT COUNT(*) as count FROM collaboration_activity_log
        WHERE project_id = ${projectId}
          AND actor_id = ${actorId}
      `;
      totalCount = parseInt(countResult[0].count, 10);
    } else {
      // No filters
      activities = await sql`
        SELECT
          cal.id,
          cal.action_type,
          cal.actor_role,
          cal.target_type,
          cal.target_id,
          cal.description,
          cal.old_value,
          cal.new_value,
          cal.metadata,
          cal.created_at,
          u.id as actor_id,
          u.name as actor_name,
          u.email as actor_email,
          u.avatar_url as actor_avatar_url
        FROM collaboration_activity_log cal
        JOIN users u ON cal.actor_id = u.id
        WHERE cal.project_id = ${projectId}
        ORDER BY cal.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const countResult = await sql`
        SELECT COUNT(*) as count FROM collaboration_activity_log
        WHERE project_id = ${projectId}
      `;
      totalCount = parseInt(countResult[0].count, 10);
    }

    // Format activities for response
    const formattedActivities = activities.map((activity) => ({
      id: activity.id,
      actionType: activity.action_type,
      actorRole: activity.actor_role,
      targetType: activity.target_type,
      targetId: activity.target_id,
      description: activity.description,
      oldValue: activity.old_value,
      newValue: activity.new_value,
      metadata: activity.metadata,
      createdAt: activity.created_at,
      actor: {
        id: activity.actor_id,
        name: activity.actor_name,
        email: activity.actor_email,
        avatarUrl: activity.actor_avatar_url,
      },
    }));

    return successResponse(
      { activities: formattedActivities },
      {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + activities.length < totalCount,
      }
    );
  } catch (error) {
    console.error("Error fetching activity log:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch activity log", 500);
  }
}
