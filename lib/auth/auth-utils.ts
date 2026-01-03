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
 * Validate an API key and return user info
 */
async function validateApiKey(
  apiKey: string
): Promise<AuthContext | null> {
  if (!apiKey.startsWith("aipp_")) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);

  try {
    const result = await sql`
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
    sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${keyRecord.id}`.catch(
      (err) => console.error("Failed to update API key last_used_at:", err)
    );

    return {
      userId: keyRecord.user_id,
      authType: "api-key",
      apiKeyId: keyRecord.id,
      scopes: keyRecord.scopes || ["read", "write"],
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return null;
  }
}

/**
 * Get authenticated user context from request headers
 *
 * Headers set by middleware:
 * - x-auth-type: "session" | "api-key"
 * - x-user-id: Internal database user ID
 * - x-user-stack-id: Stack Auth user ID (for session auth)
 * - x-api-key: API key (for API key auth)
 * - x-api-key-id: API key record ID (for API key auth)
 * - x-api-key-scopes: Comma-separated scopes (for API key auth)
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
      try {
        // Try to get or create user
        let dbUser = await sql`
          SELECT id FROM users WHERE stack_auth_id = ${stackAuthId}
        `;

        if (dbUser.length === 0) {
          // Create user with minimal info (middleware would have had more)
          dbUser = await sql`
            INSERT INTO users (stack_auth_id, email, name)
            VALUES (${stackAuthId}, ${stackAuthId + '@unknown.local'}, 'User')
            ON CONFLICT (stack_auth_id) DO UPDATE SET updated_at = NOW()
            RETURNING id
          `;
        }

        userId = dbUser[0]?.id;
      } catch (error) {
        console.error("Failed to sync user in getAuthContext:", error);
        return null;
      }
    }

    if (!userId) return null;

    return {
      userId,
      authType: "session",
    };
  }

  // API key authentication
  if (authType === "api-key") {
    const userId = headersList.get("x-user-id");
    const apiKeyId = headersList.get("x-api-key-id");
    const scopesHeader = headersList.get("x-api-key-scopes");

    if (!userId) return null;

    return {
      userId,
      authType: "api-key",
      apiKeyId: apiKeyId || undefined,
      scopes: scopesHeader ? scopesHeader.split(",") : ["read", "write"],
    };
  }

  // Try to validate API key directly from Authorization header
  // (fallback for when middleware doesn't process the request)
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
  userId: string
): Promise<boolean> {
  try {
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

    // Build query based on table
    let result;
    switch (table) {
      case "projects":
        result = await sql`
          SELECT 1 FROM projects WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "documents":
        result = await sql`
          SELECT 1 FROM documents WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "progress_notes":
        result = await sql`
          SELECT 1 FROM progress_notes WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "execution_history":
        result = await sql`
          SELECT 1 FROM execution_history WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      case "ai_conversations":
        result = await sql`
          SELECT 1 FROM ai_conversations WHERE id = ${resourceId} AND user_id = ${userId}
        `;
        break;
      default:
        return false;
    }

    return result.length > 0;
  } catch (error) {
    console.error("Ownership verification error:", error);
    return false;
  }
}

/**
 * Verify user owns a project (common use case)
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string
): Promise<boolean> {
  return verifyOwnership("projects", projectId, userId);
}

/**
 * Get user ID for a project (for related resources)
 */
export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  try {
    const result = await sql`
      SELECT user_id FROM projects WHERE id = ${projectId}
    `;
    return result[0]?.user_id || null;
  } catch (error) {
    console.error("Failed to get project owner:", error);
    return null;
  }
}

/**
 * Verify user can access a project step
 * (User must own the parent project)
 */
export async function verifyStepAccess(
  stepId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT 1 FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE ps.id = ${stepId} AND p.user_id = ${userId}
    `;
    return result.length > 0;
  } catch (error) {
    console.error("Step access verification error:", error);
    return false;
  }
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
