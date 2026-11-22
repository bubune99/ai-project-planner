/**
 * Auth Utilities for API Routes
 *
 * Provides unified authentication handling for both:
 * - Session-based auth (Stack Auth)
 * - API key auth (for external agents)
 */

import { headers } from "next/headers";
import { sql } from "@/lib/db/client";
import crypto from "crypto";
import { verifyCollaboratorAccess } from "@/lib/auth/collaboration-access";
import { answered, lookedUp } from "@/lib/auth/access-outcome";

/** The database to ask. Always the real one, except in a check file (lib/auth/access-outcome.assert.ts). */
type Db = typeof sql;

/**
 * Authentication context returned after validation
 */
export interface AuthContext {
  /** Internal database user ID */
  userId: string;
  /** Authentication method used */
  authType: "session" | "api-key";
  /** API key ID if authenticated via API key */
  apiKeyId?: string;
  /** API key scopes if authenticated via API key */
  scopes?: string[];
}

/**
 * Hash an API key for comparison
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Validate an API key and return user info.
 * null means the key is not one of ours, or the lookup ran and found no live key. If the lookup
 * throws, this throws DatabaseUnavailableError: a database that did not answer is not "bad key".
 */
export async function validateApiKey(
  apiKey: string,
  db: Db = sql
): Promise<AuthContext | null> {
  if (!apiKey.startsWith("aipp_")) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);

  return answered<AuthContext | null>("validateApiKey", async () => {
    const result = await db`
      SELECT ak.id, ak.user_id, ak.scopes
      FROM api_keys ak
      WHERE ak.key_hash = ${keyHash}
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `;

    if (result.length === 0) {
      return null;
    }

    const keyRecord = result[0];

    // Update last_used_at asynchronously (don't await)
    db`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${keyRecord.id}`.catch(
      (err) => console.error("Failed to update API key last_used_at:", err)
    );

    return {
      userId: keyRecord.user_id,
      authType: "api-key",
      apiKeyId: keyRecord.id,
      scopes: keyRecord.scopes || ["read", "write"],
    };
  });
}

/**
 * The internal user id for a signed-in session whose row middleware could not read or make.
 * If this throws, the person IS signed in and the database did not answer: DatabaseUnavailableError,
 * not "not signed in" (that answered 401 during an outage and sent people to sign in again).
 */
export async function userIdForSession(
  stackAuthId: string,
  db: Db = sql
): Promise<string | null> {
  return answered<string | null>("getAuthContext", async () => {
    // Try to get or create user
    let dbUser = await db`
      SELECT id FROM users WHERE stack_auth_id = ${stackAuthId}
    `;

    if (dbUser.length === 0) {
      // Create user with minimal info (middleware would have had more)
      dbUser = await db`
        INSERT INTO users (stack_auth_id, email, name)
        VALUES (${stackAuthId}, ${stackAuthId + '@unknown.local'}, 'User')
        ON CONFLICT (stack_auth_id) DO UPDATE SET updated_at = NOW()
        RETURNING id
      `;
    }

    return dbUser[0]?.id ?? null;
  });
}

/**
 * Get authenticated user context from request headers
 *
 * Headers set by middleware (client-supplied copies are stripped there):
 * - x-auth-type: "session" | "api-key"
 * - x-user-id: Internal database user ID (session auth only)
 * - x-user-stack-id: Stack Auth user ID (for session auth)
 *
 * API key auth always validates the Authorization header against api_keys.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const headersList = await headers();
  const authType = headersList.get("x-auth-type");

  // Session authentication (set by middleware)
  if (authType === "session") {
    let userId = headersList.get("x-user-id");
    const stackAuthId = headersList.get("x-user-stack-id");

    // If middleware couldn't sync user to DB, try to do it here
    if (!userId && stackAuthId) {
      userId = await userIdForSession(stackAuthId);
    }

    if (!userId) return null;

    return {
      userId,
      authType: "session",
    };
  }

  // API key authentication. Middleware only checks the key's FORMAT and never
  // sets the user, key id or scopes, so identity is NEVER taken from request
  // headers on this path: the key is always validated against api_keys below.
  // Same validation as the fallback for requests middleware did not mark.
  const authHeader = headersList.get("authorization");
  if (authHeader?.startsWith("Bearer aipp_")) {
    const apiKey = authHeader.replace("Bearer ", "");
    return await validateApiKey(apiKey);
  }

  return null;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();

  if (!context) {
    throw new Error("UNAUTHORIZED");
  }

  return context;
}

/**
 * Require specific scope - throws if scope not present
 */
export async function requireScope(scope: string): Promise<AuthContext> {
  const context = await requireAuth();

  // Session auth has all scopes
  if (context.authType === "session") {
    return context;
  }

  // Check API key scopes
  if (!context.scopes?.includes(scope)) {
    throw new Error("FORBIDDEN");
  }

  return context;
}

/**
 * Verify user owns a resource
 */
export async function verifyOwnership(
  table: string,
  resourceId: string,
  userId: string,
  db: Db = sql
): Promise<boolean> {
  // Using raw query with table name interpolation
  // Note: table name should be validated before use
  const validTables = [
    "projects",
    "documents",
    "progress_notes",
    "execution_history",
    "ai_conversations",
  ];

  if (!validTables.includes(table)) {
    console.error(`Invalid table name for ownership check: ${table}`);
    return false;
  }

  return lookedUp("verifyOwnership", resourceId, false, async () => {
    // Build query based on table
    let result;
    switch (table) {
      case "projects":
        result = await db`
          SELECT 1 FROM projects WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "documents":
        result = await db`
          SELECT 1 FROM documents WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "progress_notes":
        result = await db`
          SELECT 1 FROM progress_notes WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "execution_history":
        result = await db`
          SELECT 1 FROM execution_history WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "ai_conversations":
        result = await db`
          SELECT 1 FROM ai_conversations WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      default:
        return false;
    }

    return result.length > 0;
  });
}

/**
 * Verify user can access a project (owner OR active collaborator)
 *
 * This is the primary function for checking project access.
 * It returns true if the user is either the owner or an accepted collaborator.
 *
 * For owner-only operations (like deleting a project), use verifyProjectOwnerOnly instead.
 *
 * false means the lookup ran and found nothing. If the lookup throws, this (like every access
 * helper here) throws DatabaseUnavailableError, so an outage is never answered "Project not found".
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: Db = sql
): Promise<boolean> {
  return lookedUp("verifyProjectOwnership", projectId, false, async () => {
    // Check ownership first (fast path)
    const ownerResult = await db`
      SELECT 1 FROM projects
      WHERE id = ${projectId} AND user_id = ${userId} AND deleted_at IS NULL
    `;

    if (ownerResult.length > 0) return true;

    // Check collaborator access (must be accepted, not removed)
    const collaboratorResult = await db`
      SELECT 1 FROM project_collaborators
      WHERE project_id = ${projectId}
        AND user_id = ${userId}
        AND removed_at IS NULL
        AND accepted_at IS NOT NULL
    `;

    return collaboratorResult.length > 0;
  });
}

/**
 * Verify user can MODIFY a project: the owner, or an accepted, non-removed
 * collaborator with the editor or admin role. Viewers are read-only
 * (ROLE_PERMISSIONS in collaboration-access.ts), so verifyProjectOwnership is
 * a READ gate only and every mutating handler must also pass this check.
 */
export async function verifyProjectWriteAccess(
  projectId: string,
  userId: string,
  db: Db = sql
): Promise<boolean> {
  return verifyCollaboratorAccess(projectId, userId, "editor", db);
}

/**
 * Verify user is the actual owner of a project (not just a collaborator)
 *
 * Use this for sensitive operations like:
 * - Deleting the project
 * - Transferring ownership
 * - Changing billing settings
 */
export async function verifyProjectOwnerOnly(
  projectId: string,
  userId: string,
  db: Db = sql
): Promise<boolean> {
  return verifyOwnership("projects", projectId, userId, db);
}

/**
 * Get user ID for a project (for related resources)
 */
export async function getProjectOwnerId(projectId: string, db: Db = sql): Promise<string | null> {
  return lookedUp<string | null>("getProjectOwnerId", projectId, null, async () => {
    const result = await db`
      SELECT user_id FROM projects WHERE id = ${projectId}
    `;
    return result[0]?.user_id || null;
  });
}

/**
 * Verify user can access a project step
 * (User must own or be a collaborator on the parent project)
 */
export async function verifyStepAccess(
  stepId: string,
  userId: string,
  db: Db = sql
): Promise<boolean> {
  return lookedUp("verifyStepAccess", stepId, false, async () => {
    // Check if user owns the parent project
    const ownerResult = await db`
      SELECT 1 FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE ps.id = ${stepId} AND p.user_id = ${userId} AND p.deleted_at IS NULL
    `;

    if (ownerResult.length > 0) return true;

    // Check if user is a collaborator on the parent project
    const collaboratorResult = await db`
      SELECT 1 FROM project_steps ps
      JOIN project_collaborators pc ON ps.project_id = pc.project_id
      WHERE ps.id = ${stepId}
        AND pc.user_id = ${userId}
        AND pc.removed_at IS NULL
        AND pc.accepted_at IS NOT NULL
    `;

    return collaboratorResult.length > 0;
  });
}

/**
 * Standard error response helper
 */
export function authErrorResponse(error: Error) {
  if (error.message === "UNAUTHORIZED") {
    return {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      status: 401,
    };
  }

  if (error.message === "FORBIDDEN") {
    return {
      error: "Forbidden",
      code: "INSUFFICIENT_PERMISSIONS",
      status: 403,
    };
  }

  return {
    error: "Internal Server Error",
    code: "INTERNAL_ERROR",
    status: 500,
  };
}
