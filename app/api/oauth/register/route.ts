/**
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration
 *
 * Claude Desktop POSTs its client metadata here before starting the auth-code
 * flow. We store an allow-list of redirect_uris and issue a public client_id
 * (no secret — these are PKCE public clients).
 *
 * Public route — whitelisted in middleware. This endpoint is intentionally open
 * (that's what "dynamic" registration means); abuse surface is limited because a
 * registered client still cannot get a token without a human completing the
 * Stack Auth login + consent at /oauth/authorize.
 */

import { checkRateLimit, clientIp, HOUR_MS } from "@/lib/rate-limit"
import { NextRequest, NextResponse } from "next/server"
import { registerClient } from "@/lib/oauth/store"
import { isSafeRedirectUri } from "@/lib/oauth/redirect-uri"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS })
}

/** Registrations per client IP per hour; the route is unauthenticated. */
const REGISTRATIONS_PER_IP_PER_HOUR = 10
/** Redirect URIs one client may register. */
const MAX_REDIRECT_URIS = 10

export async function POST(request: NextRequest) {
  if (!(await checkRateLimit(`oauth-register:${clientIp(request)}`, REGISTRATIONS_PER_IP_PER_HOUR, HOUR_MS))) {
    return oauthError("too_many_requests", "Too many client registrations from this address. Try again later.", 429)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return oauthError("invalid_client_metadata", "Body must be valid JSON")
  }
  if (Array.isArray(body?.redirect_uris) && body.redirect_uris.length > MAX_REDIRECT_URIS) {
    return oauthError("invalid_redirect_uri", `At most ${MAX_REDIRECT_URIS} redirect_uris may be registered`)
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris is required and must be a non-empty array")
  }
  // Every redirect URI must be an absolute https URI, or http on a loopback
  // host. Registration is open, and the authorize endpoint hands the URI to
  // redirect() (client-side location.assign), so a javascript:/data: URI
  // would run script in this origin. Custom app schemes are rejected too.
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return oauthError("invalid_redirect_uri", "redirect_uris must be strings")
    }
    if (!isSafeRedirectUri(uri)) {
      return oauthError(
        "invalid_redirect_uri",
        "redirect_uris must be absolute https URIs (http is allowed only for localhost/127.0.0.1/[::1])"
      )
    }
  }

  try {
    const grantTypes = Array.isArray(body.grant_types)
      ? (body.grant_types as string[])
      : undefined
    const client = await registerClient({
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris: redirectUris as string[],
      grant_types: grantTypes,
      token_endpoint_auth_method:
        typeof body.token_endpoint_auth_method === "string"
          ? (body.token_endpoint_auth_method as string)
          : "none",
      scope: typeof body.scope === "string" ? (body.scope as string) : undefined,
      rawMetadata: body,
    })

    // RFC 7591 registration response.
    return NextResponse.json(
      {
        client_id: client.client_id,
        client_id_issued_at: client.client_id_issued_at,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: ["code"],
        token_endpoint_auth_method: client.token_endpoint_auth_method,
        scope: client.scope ?? "read write",
      },
      { status: 201, headers: CORS }
    )
  } catch (error) {
    console.error("POST /api/oauth/register error:", error)
    return oauthError("server_error", "Failed to register client", 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
