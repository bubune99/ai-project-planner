/**
 * Next.js Middleware
 *
 * Handles authentication for all routes:
 * - Session-based auth via Stack Auth
 * - API key auth for external agents
 *
 * Sets headers for downstream API routes:
 * - x-auth-type: "session" | "api-key"
 * - x-user-id: Internal database user ID
 * - x-user-stack-id: Stack Auth user ID (for session auth)
 * - x-api-key-id: API key record ID (for API key auth)
 * - x-api-key-scopes: Comma-separated scopes (for API key auth)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stackServerApp } from "@/lib/auth/stack-auth";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/health",
  "/api/auth", // Stack Auth API routes
  "/handler", // Stack Auth handler
];

// Static file patterns to skip
const STATIC_PATTERNS = [
  "/_next",
  "/favicon.ico",
  "/public",
  "/images",
  "/fonts",
];

/**
 * Check if route should be public
 */
function isPublicRoute(pathname: string): boolean {
  // Check static patterns
  if (STATIC_PATTERNS.some((pattern) => pathname.startsWith(pattern))) {
    return true;
  }

  // Check public routes (exact match or prefix)
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

/**
 * Validate API key format
 */
function isValidApiKeyFormat(key: string): boolean {
  // Format: aipp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (aipp_ + 32 base64url chars)
  return /^aipp_[A-Za-z0-9_-]{20,40}$/.test(key);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Method-aware public exception: the feedback widget is embeddable and meant
  // to accept reports from anonymous/end users, so POST /api/feedback is open.
  // GET (admin inbox list) and PATCH (triage) stay auth-gated below.
  if (pathname === "/api/feedback" && request.method === "POST") {
    return NextResponse.next();
  }

  // Catalog webhooks (Idea H Wave 4): receive POSTs from GitHub / Vercel.
  // These can NOT carry a Bearer API key (GitHub doesn't know one) — they
  // authenticate via HMAC signature verification done in the handler itself.
  // GET on these routes returns a healthcheck JSON, also public.
  if (pathname.startsWith("/api/catalog/webhooks/")) {
    return NextResponse.next();
  }

  // OAuth 2.1 authorization server (MCP custom connectors):
  // - /.well-known/oauth-*  : RFC 8414 / 9728 discovery (public)
  // - /api/oauth/*          : RFC 7591 registration + token exchange (public;
  //                           token endpoint is PKCE-secured)
  // - /oauth/authorize      : consent page; does its OWN Stack Auth session gate
  //                           so it controls the sign-in return URL (a middleware
  //                           redirect here would drop the OAuth query params).
  if (
    pathname.startsWith("/.well-known/oauth-") ||
    pathname.startsWith("/api/oauth/") ||
    pathname === "/oauth/authorize"
  ) {
    return NextResponse.next();
  }

  // MCP endpoint owns its own auth (Bearer aipp_). On a missing/invalid key it
  // returns 401 WITH a WWW-Authenticate header pointing at the protected-resource
  // metadata — which is how OAuth-capable MCP clients (Claude Desktop) discover
  // the auth server. If middleware redirected this to /sign-in, the client could
  // never begin the OAuth handshake.
  if (pathname === "/mcp" || pathname === "/sse" || pathname === "/message") {
    return NextResponse.next();
  }

  // Skip middleware for public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for API key in Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer aipp_")) {
    const apiKey = authHeader.replace("Bearer ", "");

    if (!isValidApiKeyFormat(apiKey)) {
      return NextResponse.json(
        { error: "Invalid API key format", code: "INVALID_API_KEY" },
        { status: 401 }
      );
    }

    // API key validation happens in the route handler
    // We just mark the request as API key auth
    const response = NextResponse.next();
    response.headers.set("x-auth-type", "api-key");
    response.headers.set("x-api-key", apiKey);
    return response;
  }

  // Check Stack Auth session
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      // No session - redirect to sign-in for pages, return 401 for API
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Unauthorized", code: "AUTH_REQUIRED" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // User is authenticated via Stack Auth
    // Set basic auth headers - user ID will be set by route handlers via getAuthContext
    const response = NextResponse.next();
    response.headers.set("x-auth-type", "session");
    response.headers.set("x-user-stack-id", user.id);

    // Try to sync user to database, but don't block on failure
    try {
      const { sql } = await import("@/lib/db/client");

      // Try to get existing user
      let dbUser = await sql`
        SELECT id FROM users WHERE stack_auth_id = ${user.id}
      `;

      // If user doesn't exist in our DB, create them
      if (dbUser.length === 0) {
        dbUser = await sql`
          INSERT INTO users (
            stack_auth_id,
            email,
            name,
            avatar_url,
            email_verified
          ) VALUES (
            ${user.id},
            ${user.primaryEmail || `${user.id}@unknown.local`},
            ${user.displayName || user.primaryEmail?.split("@")[0] || "User"},
            ${user.profileImageUrl || null},
            ${user.primaryEmailVerified || false}
          )
          ON CONFLICT (stack_auth_id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url,
            email_verified = EXCLUDED.email_verified,
            updated_at = NOW()
          RETURNING id
        `;
      }

      const internalUserId = dbUser[0]?.id;
      if (internalUserId) {
        response.headers.set("x-user-id", internalUserId);
      }
    } catch (dbError) {
      // Log but don't fail - user is still authenticated via Stack Auth
      console.warn("DB sync in middleware failed (non-blocking):", dbError);
    }

    return response;
  } catch (error) {
    console.error("Auth middleware error:", error);

    // On Stack Auth error, allow request to proceed for pages (let client-side handle)
    // For API routes, return error
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication failed", code: "AUTH_ERROR" },
        { status: 500 }
      );
    }

    // For pages, let them load - they can handle auth state client-side
    return NextResponse.next();
  }
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
