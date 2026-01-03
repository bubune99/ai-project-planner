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

    // User is authenticated via session
    // Get or sync user to our database
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

    if (!internalUserId) {
      console.error("Failed to get or create internal user ID");
      return NextResponse.json(
        { error: "Internal error", code: "USER_SYNC_FAILED" },
        { status: 500 }
      );
    }

    // Set auth headers for downstream routes
    const response = NextResponse.next();
    response.headers.set("x-auth-type", "session");
    response.headers.set("x-user-id", internalUserId);
    response.headers.set("x-user-stack-id", user.id);

    return response;
  } catch (error) {
    console.error("Auth middleware error:", error);

    // On error, allow request to proceed but without auth headers
    // Individual routes will handle unauthorized access
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication failed", code: "AUTH_ERROR" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(new URL("/sign-in", request.url));
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
