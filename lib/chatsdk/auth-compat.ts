import type { User } from "./auth-types";

/**
 * Auth compatibility layer
 * Server-side only functions - use useSession from auth-compat-client for client-side
 */

/**
 * Helper to get current user on the server
 * Returns null as we use Stack Auth which requires client-side context
 */
export function getCurrentUser(): User | null {
  // Server-side: Stack Auth user context is not available
  // The actual auth check happens via getAuthContext() in API routes
  return null;
}
