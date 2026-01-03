"use client";

import { useUser } from "@stackframe/stack";
import type { Session, User } from "./auth-types";

/**
 * Auth compatibility layer using Stack Auth
 * Provides session interface compatible with chat SDK components
 */

/**
 * useSession hook using Stack Auth
 */
export function useSession(): {
  data: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
} {
  const stackUser = useUser();

  // If no user context yet, still loading
  if (stackUser === undefined) {
    return {
      data: null,
      status: "loading",
    };
  }

  // No user means unauthenticated
  if (!stackUser) {
    return {
      data: null,
      status: "unauthenticated",
    };
  }

  // Convert Stack Auth user to our session format
  const user: User = {
    id: stackUser.id,
    name: stackUser.displayName || stackUser.primaryEmail?.split("@")[0] || "User",
    email: stackUser.primaryEmail || `${stackUser.id}@local`,
    image: stackUser.profileImageUrl || null,
  };

  const session: Session = {
    user: {
      ...user,
      type: "regular",
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };

  return {
    data: session,
    status: "authenticated",
  };
}

/**
 * Sign out using Stack Auth
 */
export async function signOut(options?: { redirectTo?: string }): Promise<void> {
  // Stack Auth sign out is handled via the SignOut component or user.signOut()
  // For client-side, we redirect to the sign-in page
  if (typeof window !== "undefined") {
    window.location.href = options?.redirectTo || "/sign-in";
  }
}

/**
 * Helper to get current user (returns null on client - use useSession instead)
 * This is kept for backwards compatibility but should not be used on client
 */
export function getCurrentUser(): User | null {
  // Client-side cannot synchronously get user
  // Use useSession hook instead
  console.warn("getCurrentUser() called on client - use useSession() hook instead");
  return null;
}
