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

import { NextRequest, NextResponse } from "next/server"
import { registerClient } from "@/lib/oauth/store"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return oauthError("invalid_client_metadata", "Body must be valid JSON")
  }

  const redirectUris = body.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris is required and must be a non-empty array")
  }
  // Every redirect URI must be an absolute URI. We deliberately allow any
  // scheme (https, http loopback, and custom app schemes like claude://) since
  // native MCP clients use all three. The real safeguard is that we only ever
  // redirect to a URI that was registered by THIS client AND matches exactly,
  // and the human sees the redirect target on the consent screen.
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return oauthError("invalid_redirect_uri", "redirect_uris must be strings")
    }
    try {
      // URL() requires an absolute URI with a scheme; custom schemes parse fine.
      new URL(uri)
    } catch {
      return oauthError("invalid_redirect_uri", `Not an absolute URI: ${uri}`)
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
