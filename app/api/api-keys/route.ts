/**
 * API Key Management Routes
 *
 * POST /api/api-keys - Create a new API key
 * GET /api/api-keys - List user's API keys (prefix only)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { getAuthContext, hashApiKey } from "@/lib/auth/auth-utils";
import crypto from "crypto";

export const dynamic = "force-dynamic"

/**
 * Generate a new API key
 * Format: aipp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (aipp_ + 32 base64url chars)
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(24); // 24 bytes = 32 base64 chars
  const base64url = randomBytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `aipp_${base64url}`;
}

/**
 * POST /api/api-keys
 * Create a new API key for the authenticated user
 *
 * Body:
 * - name: string (required) - Display name for the key
 * - scopes: string[] (optional) - Permissions, defaults to ["read", "write"]
 * - expiresIn: string (optional) - Expiration time (e.g., "30d", "1y", "never")
 *
 * Returns the full API key ONCE - it cannot be retrieved again
 */
export async function POST(request: NextRequest) {
  try {
    // Require session auth (can't create API keys with API keys)
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
          error: "API keys can only be created via session authentication",
          code: "SESSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, scopes = ["read", "write"], expiresIn } = body;

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required", code: "INVALID_NAME" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less", code: "NAME_TOO_LONG" },
        { status: 400 }
      );
    }

    // Validate scopes
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

    // Calculate expiration
    let expiresAt: Date | null = null;
    if (expiresIn && expiresIn !== "never") {
      const match = expiresIn.match(/^(\d+)(d|m|y)$/);
      if (!match) {
        return NextResponse.json(
          {
            error: "Invalid expiresIn format. Use: 30d, 6m, 1y, or never",
            code: "INVALID_EXPIRES",
          },
          { status: 400 }
        );
      }

      const [, amount, unit] = match;
      const now = new Date();
      switch (unit) {
        case "d":
          expiresAt = new Date(now.setDate(now.getDate() + parseInt(amount)));
          break;
        case "m":
          expiresAt = new Date(now.setMonth(now.getMonth() + parseInt(amount)));
          break;
        case "y":
          expiresAt = new Date(
            now.setFullYear(now.getFullYear() + parseInt(amount))
          );
          break;
      }
    }

    // Generate new API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12); // aipp_xxxxxx

    // Check for existing key with same hash (extremely unlikely)
    const existing = await sql`
      SELECT 1 FROM api_keys WHERE key_hash = ${keyHash}
    `;

    if (existing.length > 0) {
      // Regenerate (collision is astronomically unlikely, but handle it)
      return NextResponse.json(
        { error: "Please try again", code: "KEY_COLLISION" },
        { status: 500 }
      );
    }

    // Count existing keys for user (limit to 10)
    const keyCount = await sql`
      SELECT COUNT(*) as count FROM api_keys
      WHERE user_id = ${authContext.userId}
        AND revoked_at IS NULL
    `;

    if (parseInt(keyCount[0]?.count || "0") >= 10) {
      return NextResponse.json(
        {
          error: "Maximum of 10 active API keys allowed. Revoke an existing key first.",
          code: "KEY_LIMIT_REACHED",
        },
        { status: 400 }
      );
    }

    // Create the API key record
    const result = await sql`
      INSERT INTO api_keys (
        user_id,
        key_hash,
        key_prefix,
        name,
        scopes,
        expires_at
      ) VALUES (
        ${authContext.userId},
        ${keyHash},
        ${keyPrefix},
        ${name.trim()},
        ${JSON.stringify(scopes)},
        ${expiresAt}
      )
      RETURNING id, key_prefix, name, scopes, expires_at, created_at
    `;

    const keyRecord = result[0];

    return NextResponse.json({
      success: true,
      apiKey: {
        id: keyRecord.id,
        key: apiKey, // Full key - only shown once!
        keyPrefix: keyRecord.key_prefix,
        name: keyRecord.name,
        scopes: keyRecord.scopes,
        expiresAt: keyRecord.expires_at,
        createdAt: keyRecord.created_at,
      },
      warning:
        "Save this API key now. You won't be able to see it again!",
    });
  } catch (error: unknown) {
    console.error("Create API key error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create API key", details: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user
 * Only returns key prefix, not full key
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext();

    if (!authContext) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    // Only allow session auth to list keys
    if (authContext.authType !== "session") {
      return NextResponse.json(
        {
          error: "API keys can only be listed via session authentication",
          code: "SESSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeRevoked = searchParams.get("includeRevoked") === "true";

    let keys;
    if (includeRevoked) {
      keys = await sql`
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
        WHERE user_id = ${authContext.userId}
        ORDER BY created_at DESC
      `;
    } else {
      keys = await sql`
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
        WHERE user_id = ${authContext.userId}
          AND revoked_at IS NULL
        ORDER BY created_at DESC
      `;
    }

    return NextResponse.json({
      apiKeys: keys.map((key) => ({
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
      })),
    });
  } catch (error: unknown) {
    console.error("List API keys error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to list API keys", details: message },
      { status: 500 }
    );
  }
}

// Mark as dynamic to prevent static generation
;
