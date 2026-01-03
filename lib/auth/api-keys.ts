/**
 * API Key Generation and Management
 *
 * API keys allow external agents (like Claude Code) to authenticate
 * and update project progress without a browser session.
 *
 * Key Format: aipp_<32 base64url characters>
 * Storage: SHA-256 hash stored in database
 */

import crypto from "crypto";
import { sql } from "@/lib/db/client";
import { hashApiKey } from "./auth-utils";

/**
 * API Key record from database
 */
export interface ApiKeyRecord {
  id: string;
  user_id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
}

/**
 * Result of creating a new API key
 */
export interface CreateApiKeyResult {
  /** Full API key (only shown once!) */
  key: string;
  /** Database record (without hash) */
  record: ApiKeyRecord;
}

/**
 * Generate a new API key
 *
 * @returns A secure random API key in format: aipp_<32 chars>
 */
export function generateApiKey(): string {
  // Generate 24 random bytes = 32 base64url characters
  const randomBytes = crypto.randomBytes(24);
  const base64url = randomBytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `aipp_${base64url}`;
}

/**
 * Create a new API key for a user
 *
 * @param userId - Internal database user ID
 * @param name - Human-readable name for the key
 * @param scopes - Permissions for this key (default: read, write)
 * @param expiresInDays - Optional expiration (null = never expires)
 * @returns The full key (shown once) and the database record
 */
export async function createApiKey(
  userId: string,
  name: string,
  scopes: string[] = ["read", "write"],
  expiresInDays?: number
): Promise<CreateApiKeyResult> {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = key.substring(0, 12); // "aipp_xxxxxx"

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const result = await sql`
    INSERT INTO api_keys (
      user_id,
      key_hash,
      key_prefix,
      name,
      scopes,
      expires_at
    ) VALUES (
      ${userId},
      ${keyHash},
      ${keyPrefix},
      ${name},
      ${JSON.stringify(scopes)},
      ${expiresAt}
    )
    RETURNING id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at, revoked_at
  `;

  return {
    key, // Only time the full key is available!
    record: result[0] as ApiKeyRecord,
  };
}

/**
 * List all API keys for a user (without hashes)
 */
export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const result = await sql`
    SELECT id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at, revoked_at
    FROM api_keys
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return result as ApiKeyRecord[];
}

/**
 * List only active (non-revoked, non-expired) API keys
 */
export async function listActiveApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const result = await sql`
    SELECT id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at, revoked_at
    FROM api_keys
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
  `;

  return result as ApiKeyRecord[];
}

/**
 * Revoke an API key
 *
 * @param keyId - API key record ID
 * @param userId - Must match the key's owner
 * @returns true if revoked, false if not found or not owned
 */
export async function revokeApiKey(
  keyId: string,
  userId: string
): Promise<boolean> {
  const result = await sql`
    UPDATE api_keys
    SET revoked_at = NOW()
    WHERE id = ${keyId}
      AND user_id = ${userId}
      AND revoked_at IS NULL
    RETURNING id
  `;

  return result.length > 0;
}

/**
 * Delete an API key permanently
 *
 * @param keyId - API key record ID
 * @param userId - Must match the key's owner
 * @returns true if deleted, false if not found or not owned
 */
export async function deleteApiKey(
  keyId: string,
  userId: string
): Promise<boolean> {
  const result = await sql`
    DELETE FROM api_keys
    WHERE id = ${keyId}
      AND user_id = ${userId}
    RETURNING id
  `;

  return result.length > 0;
}

/**
 * Get a single API key by ID (for displaying details)
 */
export async function getApiKey(
  keyId: string,
  userId: string
): Promise<ApiKeyRecord | null> {
  const result = await sql`
    SELECT id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at, revoked_at
    FROM api_keys
    WHERE id = ${keyId}
      AND user_id = ${userId}
  `;

  return (result[0] as ApiKeyRecord) || null;
}

/**
 * Update API key name or scopes
 */
export async function updateApiKey(
  keyId: string,
  userId: string,
  updates: { name?: string; scopes?: string[] }
): Promise<ApiKeyRecord | null> {
  // Build dynamic update
  const result = await sql`
    UPDATE api_keys
    SET
      name = COALESCE(${updates.name || null}, name),
      scopes = COALESCE(${updates.scopes ? JSON.stringify(updates.scopes) : null}, scopes)
    WHERE id = ${keyId}
      AND user_id = ${userId}
      AND revoked_at IS NULL
    RETURNING id, user_id, key_prefix, name, scopes, last_used_at, expires_at, created_at, revoked_at
  `;

  return (result[0] as ApiKeyRecord) || null;
}
