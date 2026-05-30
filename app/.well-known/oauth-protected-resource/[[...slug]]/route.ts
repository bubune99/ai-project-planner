/**
 * RFC 9728 — OAuth Protected Resource Metadata
 *
 * Optional catch-all so we answer BOTH:
 *   /.well-known/oauth-protected-resource          (bare)
 *   /.well-known/oauth-protected-resource/mcp       (path-suffixed, what an
 *                                                    RFC 9728 client derives for
 *                                                    a resource served at /mcp)
 *
 * Points the client at this app as its own authorization server. The MCP route
 * also emits a WWW-Authenticate header referencing this document on 401 so the
 * client knows where to begin.
 *
 * Public route — whitelisted in middleware.
 */

import { NextRequest, NextResponse } from "next/server"
import { resolveOrigin, protectedResourceMetadata } from "@/lib/oauth/metadata"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

export async function GET(request: NextRequest) {
  const origin = resolveOrigin(request.url)
  return NextResponse.json(protectedResourceMetadata(origin), { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
