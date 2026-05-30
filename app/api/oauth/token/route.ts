/**
 * OAuth 2.1 Token Endpoint — /api/oauth/token
 *
 * Exchanges a PKCE-bound authorization code for an access token. The access
 * token IS a freshly minted aipp_ API key scoped to the consenting user — so
 * the existing /mcp Bearer-aipp_ path validates it with zero changes, and the
 * key shows up in Settings → API Keys where it can be revoked.
 *
 * Only grant_type=authorization_code is supported. Tokens do not expire (they
 * are API keys), so no refresh flow is offered.
 *
 * Public route — whitelisted in middleware. Security is enforced by: single-use
 * code consumption, exact redirect_uri match, and PKCE S256 verification.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { createApiKey } from "@/lib/auth/api-keys"
import {
  consumeAuthCode,
  verifyPkceS256,
  touchClientUsed,
  sha256hex,
} from "@/lib/oauth/store"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } }
  )
}

/** Parse either form-encoded (OAuth standard) or JSON token requests. */
async function parseBody(request: NextRequest): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") || ""
  if (ct.includes("application/json")) {
    const j = await request.json().catch(() => ({}))
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(j ?? {})) out[k] = String(v)
    return out
  }
  const form = await request.formData()
  const out: Record<string, string> = {}
  for (const [k, v] of form.entries()) out[k] = String(v)
  return out
}

export async function POST(request: NextRequest) {
  let body: Record<string, string>
  try {
    body = await parseBody(request)
  } catch {
    return oauthError("invalid_request", "Could not parse request body")
  }

  const grantType = body.grant_type
  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", `grant_type '${grantType}' is not supported`)
  }

  const code = body.code
  const redirectUri = body.redirect_uri
  const codeVerifier = body.code_verifier
  // client_id may also arrive via HTTP Basic, but public clients send it in body.
  const clientId = body.client_id

  if (!code) return oauthError("invalid_request", "Missing 'code'")
  if (!redirectUri) return oauthError("invalid_request", "Missing 'redirect_uri'")
  if (!codeVerifier) return oauthError("invalid_request", "Missing PKCE 'code_verifier'")

  try {
    // Atomically consume the code (single-use, unexpired).
    const grant = await consumeAuthCode(code)
    if (!grant) {
      return oauthError("invalid_grant", "Authorization code is invalid, expired, or already used")
    }

    // Bindings must all match what was issued at /authorize.
    if (clientId && clientId !== grant.client_id) {
      return oauthError("invalid_grant", "client_id does not match the authorization code")
    }
    if (redirectUri !== grant.redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri does not match the authorization code")
    }
    if (grant.code_challenge_method !== "S256" || !verifyPkceS256(codeVerifier, grant.code_challenge)) {
      return oauthError("invalid_grant", "PKCE verification failed")
    }

    // Granted scope -> api_key scopes. Full access = read+write per product call.
    const scopeStr = grant.scope || "read write"
    const scopes = scopeStr.split(/\s+/).filter(Boolean)
    const safeScopes = scopes.length ? scopes : ["read", "write"]

    // Mint the access token = a real aipp_ API key for this user.
    const keyName = `MCP Connector (${grant.client_id.slice(0, 12)})`
    const { key } = await createApiKey(grant.user_id, keyName, safeScopes)

    // Tag the key with its OAuth origin for audit/revocation grouping.
    await sql`
      UPDATE api_keys SET oauth_client_id = ${grant.client_id}
      WHERE key_hash = ${sha256hex(key)}
    `.catch(() => {})

    await touchClientUsed(grant.client_id)

    return NextResponse.json(
      {
        access_token: key,
        token_type: "Bearer",
        scope: safeScopes.join(" "),
        // No expires_in: the API key does not expire. No refresh_token.
      },
      { headers: { ...CORS, "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("POST /api/oauth/token error:", error)
    return oauthError("server_error", "Token exchange failed", 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
