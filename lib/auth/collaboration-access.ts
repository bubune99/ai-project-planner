/**
 * Collaboration Access Control
 *
 * Provides functions to verify collaborator access and permissions
 * for the project collaboration system.
 */

import { sql } from "@/lib/db/client";
import type { CollaboratorRole } from "@/lib/db/schema";

// Role hierarchy for permission checking (higher number = more access)
const ROLE_HIERARCHY: Record<CollaboratorRole | "owner", number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

// What each role can do
export const ROLE_PERMISSIONS = {
  viewer: ["read"] as const,
  editor: ["read", "write"] as const,
  admin: ["read", "write", "manage"] as const,
  owner: ["read", "write", "manage", "delete"] as const,
} as const;

export type Permission = "read" | "write" | "manage" | "delete";

/**
 * Project access result
 */
export interface ProjectAccess {
  role: CollaboratorRole | "owner";
  isOwner: boolean;
  permissions: readonly Permission[];
}

/**
 * Get user's access level for a project
 * Returns role and permissions if user has access, null otherwise
 */
export async function getProjectAccess(
  projectId: string,
  userId: string
): Promise<ProjectAccess | null> {
  try {
    // Check if user is owner
    const ownerCheck = await sql`
      SELECT 1 FROM projects
      WHERE id = ${projectId} AND user_id = ${userId} AND deleted_at IS NULL
    `;

    if (ownerCheck.length > 0) {
      return {
        role: "owner",
        isOwner: true,
        permissions: ROLE_PERMISSIONS.owner,
      };
    }

    // Check if user is a collaborator
    const collaboratorCheck = await sql`
      SELECT role FROM project_collaborators
      WHERE project_id = ${projectId}
        AND user_id = ${userId}
        AND removed_at IS NULL
        AND accepted_at IS NOT NULL
    `;

    if (collaboratorCheck.length > 0) {
      const role = collaboratorCheck[0].role as CollaboratorRole;
      return {
        role,
        isOwner: false,
        permissions: ROLE_PERMISSIONS[role],
      };
    }

    return null;
  } catch (error) {
    console.error("Error checking project access:", error);
    return null;
  }
}

/**
 * Verify user has at least the required role for a project
 *
 * @param projectId - The project ID to check access for
 * @param userId - The user ID to check
 * @param requiredRole - Minimum role required (optional, defaults to any access)
 * @returns true if user has sufficient access
 */
export async function verifyCollaboratorAccess(
  projectId: string,
  userId: string,
  requiredRole?: CollaboratorRole
): Promise<boolean> {
  const access = await getProjectAccess(projectId, userId);

  if (!access) return false;

  // Owners always have access
  if (access.isOwner) return true;

  // If no specific role required, any collaborator access is sufficient
  if (!requiredRole) return true;

  // Check if user's role meets the requirement
  const userRoleLevel = ROLE_HIERARCHY[access.role];
  const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

  return userRoleLevel >= requiredRoleLevel;
}

/**
 * Check if user can perform a specific action on a project
 *
 * @param projectId - The project ID
 * @param userId - The user ID
 * @param permission - The permission to check (read, write, manage, delete)
 * @returns true if user has the permission
 */
export async function canPerformAction(
  projectId: string,
  userId: string,
  permission: Permission
): Promise<boolean> {
  const access = await getProjectAccess(projectId, userId);

  if (!access) return false;

  return (access.permissions as readonly string[]).includes(permission);
}

/**
 * Get user's role string for activity logging
 * Returns 'owner', 'admin', 'editor', 'viewer', or null
 */
export async function getUserRoleForProject(
  projectId: string,
  userId: string
): Promise<string | null> {
  const access = await getProjectAccess(projectId, userId);
  return access?.role || null;
}

/**
 * List all users who can access a project (owner + collaborators)
 */
export async function getProjectAccessList(projectId: string): Promise<{
  owner: {
    id: string;
    name: string | null;
    email: string;
    avatar_url: string | null;
  };
  collaborators: Array<{
    id: string;
    user_id: string;
    name: string | null;
    email: string;
    avatar_url: string | null;
    role: CollaboratorRole;
    invited_at: Date;
    accepted_at: Date;
  }>;
}> {
  // Get owner
  const ownerResult = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ${projectId} AND p.deleted_at IS NULL
  `;

  if (ownerResult.length === 0) {
    throw new Error("Project not found");
  }

  // Get collaborators
  const collaborators = await sql`
    SELECT
      pc.id,
      pc.user_id,
      u.name,
      u.email,
      u.avatar_url,
      pc.role,
      pc.invited_at,
      pc.accepted_at
    FROM project_collaborators pc
    JOIN users u ON pc.user_id = u.id
    WHERE pc.project_id = ${projectId}
      AND pc.removed_at IS NULL
      AND pc.accepted_at IS NOT NULL
    ORDER BY pc.accepted_at ASC
  `;

  return {
    owner: ownerResult[0],
    collaborators: collaborators as Array<{
      id: string;
      user_id: string;
      name: string | null;
      email: string;
      avatar_url: string | null;
      role: CollaboratorRole;
      invited_at: Date;
      accepted_at: Date;
    }>,
  };
}

/**
 * Check if a user is already a collaborator on a project
 */
export async function isCollaborator(
  projectId: string,
  userId: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM project_collaborators
    WHERE project_id = ${projectId}
      AND user_id = ${userId}
      AND removed_at IS NULL
  `;
  return result.length > 0;
}

/**
 * Check if a user is the owner of a project
 */
export async function isProjectOwner(
  projectId: string,
  userId: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM projects
    WHERE id = ${projectId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
  `;
  return result.length > 0;
}

/**
 * Get pending invitation for a user by email
 */
export async function getPendingInvitationByEmail(
  projectId: string,
  email: string
): Promise<{ id: string; role: CollaboratorRole } | null> {
  const result = await sql`
    SELECT id, role FROM project_invitations
    WHERE project_id = ${projectId}
      AND invitee_email = ${email}
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    role: result[0].role as CollaboratorRole,
  };
}

/**
 * Check if user has any pending invitation for a project
 * (by checking if their email matches any pending invitation)
 */
export async function hasPendingInvitation(
  projectId: string,
  userEmail: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM project_invitations
    WHERE project_id = ${projectId}
      AND invitee_email = ${userEmail}
      AND status = 'pending'
      AND expires_at > NOW()
  `;
  return result.length > 0;
}
