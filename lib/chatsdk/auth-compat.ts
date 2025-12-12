"use client";

import type { Session, User } from "./auth-types";

/**
 * Stub auth compatibility layer for ai-project-planner
 * No actual auth - provides mock user for chat functionality
 */

const mockUser: User = {
  id: "local-user",
  name: "User",
  email: "user@example.com",
  image: null,
};

const mockSession: Session = {
  user: {
    ...mockUser,
    type: "regular",
  },
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
};

/**
 * Stub useSession hook - always returns authenticated
 */
export function useSession(): {
  data: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
} {
  return {
    data: mockSession,
    status: "authenticated",
  };
}

/**
 * Stub signOut function - no-op for local development
 */
export async function signOut(options?: { redirectTo?: string }): Promise<void> {
  console.log("signOut called (stub)", options);
  // No-op for local development
}

/**
 * Helper to get current user (server-side)
 */
export function getCurrentUser(): User | null {
  return mockUser;
}
