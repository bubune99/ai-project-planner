/**
 * MCP Request Context
 *
 * Provides request-scoped user context for MCP tools using AsyncLocalStorage.
 * This allows tools to access the authenticated user's ID without passing it
 * through every function call.
 */

import { AsyncLocalStorage } from "async_hooks";
import { sql } from "@/lib/db/client";
import { hashApiKey, type AuthContext } from "./auth-utils";

/**
 * MCP-specific context including user info and permissions
 */
export interface McpContext {
  /** Internal database user ID */
  userId: string;
  /** API key ID used for authentication */
  apiKeyId: string;
  /** Scopes granted to this API key */
  scopes: string[];
  /** User's email (for logging) */
  email?: string;
  /** Active project ID (like gh repo set-default) */
  activeProjectId?: string;
}

// AsyncLocalStorage for request-scoped context
const mcpContextStorage = new AsyncLocalStorage<McpContext>();

/**
 * Validate an MCP API key and return context
 *
 * Accepts keys in format: aipp_<32 base64url chars>
 * Via headers: X-API-Key or Authorization: Bearer
 */
export async function validateMcpApiKey(
  apiKey: string | null
): Promise<McpContext | null> {
  if (!apiKey) {
    return null;
  }

  // Handle Bearer token format
  const key = apiKey.startsWith("Bearer ")
    ? apiKey.replace("Bearer ", "")
    : apiKey;

  // Validate key format
  if (!key.startsWith("aipp_")) {
    return null;
  }

  const keyHash = hashApiKey(key);

  try {
    const result = await sql`
      SELECT
        ak.id as key_id,
        ak.user_id,
        ak.scopes,
        ak.active_project_id,
        u.email
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ${keyHash}
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `;

    if (result.length === 0) {
      return null;
    }

    const keyRecord = result[0];

    // Update last_used_at asynchronously
    sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${keyRecord.key_id}`.catch(
      (err) => console.error("Failed to update MCP API key last_used_at:", err)
    );

    return {
      userId: keyRecord.user_id,
      apiKeyId: keyRecord.key_id,
      scopes: keyRecord.scopes || ["read", "write"],
      email: keyRecord.email,
      activeProjectId: keyRecord.active_project_id || undefined,
    };
  } catch (error) {
    console.error("MCP API key validation error:", error);
    return null;
  }
}

/**
 * Run a function with MCP context
 *
 * Usage:
 * ```ts
 * await runWithMcpContext(context, async () => {
 *   // Tools can call getMcpContext() here
 * });
 * ```
 */
export function runWithMcpContext<T>(
  context: McpContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return mcpContextStorage.run(context, fn);
}

/**
 * Get the current MCP context
 *
 * @throws Error if called outside of MCP context
 */
export function getMcpContext(): McpContext {
  const context = mcpContextStorage.getStore();
  if (!context) {
    throw new Error("MCP context not available - called outside of MCP request");
  }
  return context;
}

/**
 * Get the current MCP context (nullable version)
 *
 * Returns null if called outside of MCP context
 */
export function getMcpContextOrNull(): McpContext | null {
  return mcpContextStorage.getStore() || null;
}

/**
 * Get the current user ID from MCP context
 *
 * @throws Error if called outside of MCP context
 */
export function getMcpUserId(): string {
  return getMcpContext().userId;
}

/**
 * Check if the current MCP context has a specific scope
 */
export function hasMcpScope(scope: string): boolean {
  const context = getMcpContextOrNull();
  if (!context) return false;
  return context.scopes.includes(scope);
}

/**
 * Require a specific scope, throwing if not present
 *
 * @throws Error if scope not present
 */
export function requireMcpScope(scope: string): void {
  if (!hasMcpScope(scope)) {
    throw new Error(`MCP operation requires '${scope}' scope`);
  }
}

/**
 * Verify the current user owns a project
 */
export async function verifyMcpProjectOwnership(projectId: string): Promise<boolean> {
  const context = getMcpContextOrNull();
  if (!context) return false;

  try {
    const result = await sql`
      SELECT 1 FROM projects
      WHERE id = ${projectId} AND user_id = ${context.userId}
    `;
    return result.length > 0;
  } catch (error) {
    console.error("MCP project ownership verification error:", error);
    return false;
  }
}

/**
 * Verify the current user can access a step (via project ownership)
 */
export async function verifyMcpStepAccess(stepId: string): Promise<boolean> {
  const context = getMcpContextOrNull();
  if (!context) return false;

  try {
    const result = await sql`
      SELECT 1 FROM project_steps ps
      JOIN projects p ON ps.project_id = p.id
      WHERE ps.id = ${stepId} AND p.user_id = ${context.userId}
    `;
    return result.length > 0;
  } catch (error) {
    console.error("MCP step access verification error:", error);
    return false;
  }
}

/**
 * Verify the current user owns a document
 */
export async function verifyMcpDocumentOwnership(documentId: string): Promise<boolean> {
  const context = getMcpContextOrNull();
  if (!context) return false;

  try {
    const result = await sql`
      SELECT 1 FROM documents
      WHERE id = ${documentId} AND user_id = ${context.userId}
    `;
    return result.length > 0;
  } catch (error) {
    console.error("MCP document ownership verification error:", error);
    return false;
  }
}

/**
 * Get the active project ID for the current API key
 * Returns null if no active project is set
 */
export function getActiveProjectId(): string | null {
  const context = getMcpContextOrNull();
  return context?.activeProjectId ?? null;
}

/**
 * Set the active project for the current API key
 * Persists across sessions until changed
 */
export async function setActiveProject(projectId: string | null): Promise<boolean> {
  const context = getMcpContextOrNull();
  if (!context) return false;

  try {
    // If setting a project, verify ownership first
    if (projectId) {
      const owns = await verifyMcpProjectOwnership(projectId);
      if (!owns) return false;
    }

    await sql`
      UPDATE api_keys
      SET active_project_id = ${projectId}
      WHERE id = ${context.apiKeyId}
    `;

    // Update local context (for subsequent calls in this request)
    context.activeProjectId = projectId ?? undefined;

    return true;
  } catch (error) {
    console.error("Failed to set active project:", error);
    return false;
  }
}

/**
 * Find a project by git remote URL
 */
export async function findProjectByGitRemote(gitRemote: string): Promise<string | null> {
  const context = getMcpContextOrNull();
  if (!context) return null;

  try {
    // Normalize git remote URL (handle various formats)
    const normalized = normalizeGitRemote(gitRemote);

    const result = await sql`
      SELECT id FROM projects
      WHERE user_id = ${context.userId}
        AND github_repo_url IS NOT NULL
        AND (
          github_repo_url = ${gitRemote}
          OR github_repo_url = ${normalized}
          OR github_repo_url ILIKE ${"%" + extractRepoPath(gitRemote)}
        )
        AND deleted_at IS NULL
      LIMIT 1
    `;

    return result.length > 0 ? result[0].id : null;
  } catch (error) {
    console.error("Failed to find project by git remote:", error);
    return null;
  }
}

/**
 * Find a project by workspace path
 */
export async function findProjectByWorkspacePath(workspacePath: string): Promise<string | null> {
  const context = getMcpContextOrNull();
  if (!context) return null;

  try {
    const result = await sql`
      SELECT id FROM projects
      WHERE user_id = ${context.userId}
        AND workspace_path = ${workspacePath}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    return result.length > 0 ? result[0].id : null;
  } catch (error) {
    console.error("Failed to find project by workspace path:", error);
    return null;
  }
}

/**
 * Update project workspace identifiers
 */
export async function updateProjectWorkspace(
  projectId: string,
  updates: { gitRemote?: string; workspacePath?: string }
): Promise<boolean> {
  const context = getMcpContextOrNull();
  if (!context) return false;

  try {
    const owns = await verifyMcpProjectOwnership(projectId);
    if (!owns) return false;

    if (updates.gitRemote !== undefined) {
      await sql`
        UPDATE projects
        SET github_repo_url = ${updates.gitRemote}
        WHERE id = ${projectId}
      `;
    }

    if (updates.workspacePath !== undefined) {
      await sql`
        UPDATE projects
        SET workspace_path = ${updates.workspacePath}
        WHERE id = ${projectId}
      `;
    }

    return true;
  } catch (error) {
    console.error("Failed to update project workspace:", error);
    return false;
  }
}

// Helper: Normalize git remote URL formats
function normalizeGitRemote(remote: string): string {
  // Convert SSH to HTTPS format for matching
  // git@github.com:user/repo.git -> https://github.com/user/repo
  if (remote.startsWith("git@")) {
    return remote
      .replace("git@", "https://")
      .replace(":", "/")
      .replace(/\.git$/, "");
  }
  // Remove .git suffix from HTTPS URLs
  return remote.replace(/\.git$/, "");
}

// Helper: Extract repo path (user/repo) from various formats
function extractRepoPath(remote: string): string {
  // git@github.com:user/repo.git -> user/repo
  // https://github.com/user/repo -> user/repo
  const match = remote.match(/[:/]([^/:]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : remote;
}
