/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata
 *
 * Optional catch-all so we answer BOTH the bare well-known path and any
 * path-suffixed variant a client may probe.
 *
 * Advertises authorization_code + PKCE (S256) with public clients ('none'
 * token auth) and RFC 7591 dynamic registration — exactly what Claude Desktop's
 * custom-connector flow expects.
 *
 * Public route — whitelisted in middleware.
 */

import { NextRequest, NextResponse } from "next/server"
import { resolveOrigin, authServerMetadata } from "@/lib/oauth/metadata"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request.url)
  return NextResponse.json(authServerMetadata(origin), { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
