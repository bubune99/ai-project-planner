/**
 * Individual API Key Management Routes
 *
 * GET /api/api-keys/[id] - Get details about a specific API key
 * PATCH /api/api-keys/[id] - Update API key (name, scopes)
 * DELETE /api/api-keys/[id] - Revoke an API key
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext } from "@/lib/auth/auth-utils";

export const dynamic = "force-dynamic"

/**
 * GET /api/api-keys/[id]
 * Get details about a specific API key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authContext = await getAuthContext();

    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    if (authContext.authType !== "session") {
      return NextResponse.json(
        {
          error: "API keys can only be managed via session authentication",
          code: "SESSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const result = await sql`
      SELECT
        id,
        key_prefix,
        name,
        scopes,
        last_used_at,
        expires_at,
        created_at,
        revoked_at
      FROM api_keys
      WHERE id = ${id}
        AND user_id = ${authContext.userId}
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "API key not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const key = result[0];

    return NextResponse.json({
      apiKey: {
        id: key.id,
        keyPrefix: key.key_prefix,
        name: key.name,
        scopes: key.scopes,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
        createdAt: key.created_at,
        revokedAt: key.revoked_at,
        isExpired: key.expires_at && new Date(key.expires_at) < new Date(),
        isRevoked: !!key.revoked_at,
      },
    });
  } catch (error: unknown) {
    console.error("Get API key error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to get API key", details: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/api-keys/[id]
 * Update API key name or scopes
 *
 * Body:
 * - name: string (optional) - New display name
 * - scopes: string[] (optional) - New permissions
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authContext = await getAuthContext();

    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    if (authContext.authType !== "session") {
      return NextResponse.json(
        {
          error: "API keys can only be managed via session authentication",
          code: "SESSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, scopes } = body;

    // Verify ownership and not revoked
    const existing = await sql`
      SELECT id, revoked_at FROM api_keys
      WHERE id = ${id}
        AND user_id = ${authContext.userId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "API key not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (existing[0].revoked_at) {
      return NextResponse.json(
        { error: "Cannot update a revoked API key", code: "KEY_REVOKED" },
        { status: 400 }
      );
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty", code: "INVALID_NAME" },
          { status: 400 }
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { error: "Name must be 100 characters or less", code: "NAME_TOO_LONG" },
          { status: 400 }
        );
      }
    }

    // Validate scopes if provided
    if (scopes !== undefined) {
      const validScopes = ["read", "write", "admin"];
      if (!Array.isArray(scopes) || !scopes.every((s) => validScopes.includes(s))) {
        return NextResponse.json(
          {
            error: `Invalid scopes. Valid scopes are: ${validScopes.join(", ")}`,
            code: "INVALID_SCOPES",
          },
          { status: 400 }
        );
      }
    }

    // Build update query
    const result = await sql`
      UPDATE api_keys
      SET
        name = COALESCE(${name?.trim() || null}, name),
        scopes = COALESCE(${scopes ? JSON.stringify(scopes) : null}::jsonb, scopes)
      WHERE id = ${id}
        AND user_id = ${authContext.userId}
      RETURNING
        id,
        key_prefix,
        name,
        scopes,
        last_used_at,
        expires_at,
        created_at,
        revoked_at
    `;

    const key = result[0];

    return NextResponse.json({
      success: true,
      apiKey: {
        id: key.id,
        keyPrefix: key.key_prefix,
        name: key.name,
        scopes: key.scopes,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
        createdAt: key.created_at,
        revokedAt: key.revoked_at,
      },
    });
  } catch (error: unknown) {
    console.error("Update API key error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update API key", details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/api-keys/[id]
 * Revoke an API key (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authContext = await getAuthContext();

    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    if (authContext.authType !== "session") {
      return NextResponse.json(
        {
          error: "API keys can only be managed via session authentication",
          code: "SESSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    // Verify ownership
    const existing = await sql`
      SELECT id, name, revoked_at FROM api_keys
      WHERE id = ${id}
        AND user_id = ${authContext.userId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "API key not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (existing[0].revoked_at) {
      return NextResponse.json(
        { error: "API key is already revoked", code: "ALREADY_REVOKED" },
        { status: 400 }
      );
    }

    // Soft delete by setting revoked_at
    await sql`
      UPDATE api_keys
      SET revoked_at = NOW()
      WHERE id = ${id}
        AND user_id = ${authContext.userId}
    `;

    return NextResponse.json({
      success: true,
      message: `API key "${existing[0].name}" has been revoked`,
    });
  } catch (error: unknown) {
    console.error("Revoke API key error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to revoke API key", details: message },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
