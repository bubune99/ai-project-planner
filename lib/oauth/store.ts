/**
 * OAuth 2.1 store + helpers for the MCP custom-connector authorization server.
 *
 * This is intentionally small: OAuth here is a thin auto-provisioning shell over
 * the existing api_keys table. We persist registered clients and short-lived,
 * PKCE-bound, single-use authorization codes. The access token we eventually
 * return is a real aipp_ API key (minted in the /token route via createApiKey),
 * so there is NO separate access-token store to maintain here.
 *
 * Security posture:
 * - Raw codes and client secrets are NEVER stored — only sha256 hashes.
 * - Auth codes are single-use (consumed_at) and short-TTL.
 * - PKCE S256 is required (we reject 'plain').
 * - redirect_uri is matched EXACTLY against the client's registered allow-list.
 */

import crypto from "crypto"
import { sql } from "@/lib/db/client"

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

/** base64url with no padding, per RFC 7636. */
export function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

export function sha256hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex")
}

/** A random, URL-safe opaque token (for codes and client ids). */
export function randomToken(bytes = 32): string {
  return base64url(crypto.randomBytes(bytes))
}

/**
 * Verify a PKCE code_verifier against a stored S256 challenge.
 * challenge === base64url(sha256(verifier))
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const computed = base64url(crypto.createHash("sha256").update(verifier).digest())
  // constant-time compare on equal-length strings
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  client_id: string
  client_name: string | null
  redirect_uris: string[]
  grant_types: string[]
  token_endpoint_auth_method: string
  scope: string | null
}

export interface RegisterClientInput {
  client_name?: string
  redirect_uris: string[]
  grant_types?: string[]
  token_endpoint_auth_method?: string
  scope?: string
  rawMetadata?: unknown
}

// ---------------------------------------------------------------------------
// Client registration (RFC 7591)
// ---------------------------------------------------------------------------

export async function registerClient(
  input: RegisterClientInput
): Promise<OAuthClient & { client_id_issued_at: number }> {
  const clientId = `mcp_${randomToken(18)}`
  // We only actually support authorization_code (our access token is a
  // non-expiring aipp_ key, so there is nothing to refresh). Honest advertising.
  const grantTypes = ["authorization_code"]
  void input.grant_types // accepted from client metadata but not honored
  const authMethod = input.token_endpoint_auth_method || "none"

  const rows = (await sql`
    INSERT INTO oauth_clients (
      client_id, client_name, redirect_uris, grant_types,
      token_endpoint_auth_method, scope, metadata
    ) VALUES (
      ${clientId},
      ${input.client_name || null},
      ${JSON.stringify(input.redirect_uris)},
      ${JSON.stringify(grantTypes)},
      ${authMethod},
      ${input.scope || null},
      ${JSON.stringify(input.rawMetadata ?? {})}
    )
    RETURNING client_id, client_name, redirect_uris, grant_types,
              token_endpoint_auth_method, scope,
              EXTRACT(EPOCH FROM created_at)::bigint AS created_epoch
  `) as any[]
  const r = rows[0]
  return {
    client_id: r.client_id,
    client_name: r.client_name,
    redirect_uris: r.redirect_uris,
    grant_types: r.grant_types,
    token_endpoint_auth_method: r.token_endpoint_auth_method,
    scope: r.scope,
    client_id_issued_at: Number(r.created_epoch),
  }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId) return null
  const rows = (await sql`
    SELECT client_id, client_name, redirect_uris, grant_types,
           token_endpoint_auth_method, scope
    FROM oauth_clients
    WHERE client_id = ${clientId}
  `) as any[]
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    client_id: r.client_id,
    client_name: r.client_name,
    redirect_uris: r.redirect_uris,
    grant_types: r.grant_types,
    token_endpoint_auth_method: r.token_endpoint_auth_method,
    scope: r.scope,
  }
}

/** Exact-match redirect_uri against the client's registered allow-list. */
export function redirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
  return Array.isArray(client.redirect_uris) && client.redirect_uris.includes(redirectUri)
}

// ---------------------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------------------

export interface IssueCodeInput {
  clientId: string
  userId: string
  redirectUri: string
  scope: string | null
  resource: string | null
  codeChallenge: string
  codeChallengeMethod: string
  ttlSeconds?: number
}

/** Mint an auth code, store only its hash, return the raw code to redirect with. */
export async function issueAuthCode(input: IssueCodeInput): Promise<string> {
  const code = randomToken(32)
  const codeHash = sha256hex(code)
  const ttl = input.ttlSeconds ?? 600 // 10 minutes
  await sql`
    INSERT INTO oauth_auth_codes (
      code_hash, client_id, user_id, redirect_uri, scope, resource,
      code_challenge, code_challenge_method, expires_at
    ) VALUES (
      ${codeHash},
      ${input.clientId},
      ${input.userId},
      ${input.redirectUri},
      ${input.scope},
      ${input.resource},
      ${input.codeChallenge},
      ${input.codeChallengeMethod},
      NOW() + (${ttl} * INTERVAL '1 second')
    )
  `
  return code
}

export interface ConsumedCode {
  client_id: string
  user_id: string
  redirect_uri: string
  scope: string | null
  resource: string | null
  code_challenge: string
  code_challenge_method: string
}

/**
 * Atomically consume an auth code: marks consumed_at in the same UPDATE that
 * checks it is unconsumed + unexpired, so a replayed code cannot be exchanged
 * twice even under a race. Returns null if not found / expired / already used.
 */
export async function consumeAuthCode(code: string): Promise<ConsumedCode | null> {
  const codeHash = sha256hex(code)
  const rows = (await sql`
    UPDATE oauth_auth_codes
    SET consumed_at = NOW()
    WHERE code_hash = ${codeHash}
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING client_id, user_id, redirect_uri, scope, resource,
              code_challenge, code_challenge_method
  `) as any[]
  return (rows[0] as ConsumedCode) ?? null
}

export async function touchClientUsed(clientId: string): Promise<void> {
  await sql`UPDATE oauth_clients SET last_used_at = NOW() WHERE client_id = ${clientId}`.catch(
    () => {}
  )
}
