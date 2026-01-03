/**
 * Stack Auth Configuration
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_STACK_PROJECT_ID: Stack Auth project ID
 * - NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: Public client key (pk_xxx)
 * - STACK_SECRET_SERVER_KEY: Secret server key (sk_xxx)
 */

import { StackServerApp } from "@stackframe/stack";
import { sql } from "@/lib/db/client";

// Initialize Stack Auth server app
export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  urls: {
    handler: "/handler",
    signIn: "/sign-in",
    signUp: "/sign-up",
    afterSignIn: "/dashboard",
    afterSignOut: "/",
    afterSignUp: "/dashboard",
  },
});

/**
 * User type from our database
 */
export interface DbUser {
  id: string;
  stack_auth_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get the current authenticated user from Stack Auth
 */
export async function getCurrentStackUser() {
  return await stackServerApp.getUser();
}

/**
 * Sync Stack Auth user to our database
 * Creates or updates the user record
 */
export async function syncUserToDatabase(
  stackUser: Awaited<ReturnType<typeof getCurrentStackUser>>
): Promise<DbUser | null> {
  if (!stackUser) return null;

  try {
    const result = await sql`
      INSERT INTO users (
        stack_auth_id,
        email,
        name,
        avatar_url,
        email_verified,
        updated_at
      ) VALUES (
        ${stackUser.id},
        ${stackUser.primaryEmail || `${stackUser.id}@unknown.local`},
        ${stackUser.displayName || stackUser.primaryEmail?.split("@")[0] || "User"},
        ${stackUser.profileImageUrl || null},
        ${stackUser.primaryEmailVerified || false},
        NOW()
      )
      ON CONFLICT (stack_auth_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        email_verified = EXCLUDED.email_verified,
        updated_at = NOW()
      RETURNING *
    `;

    return result[0] as DbUser;
  } catch (error) {
    console.error("Failed to sync user to database:", error);
    return null;
  }
}

/**
 * Get internal database user ID from Stack Auth ID
 */
export async function getInternalUserId(
  stackAuthId: string
): Promise<string | null> {
  try {
    const result = await sql`
      SELECT id FROM users WHERE stack_auth_id = ${stackAuthId}
    `;
    return result[0]?.id || null;
  } catch (error) {
    console.error("Failed to get internal user ID:", error);
    return null;
  }
}

/**
 * Get internal database user by Stack Auth ID
 */
export async function getDbUserByStackId(
  stackAuthId: string
): Promise<DbUser | null> {
  try {
    const result = await sql`
      SELECT * FROM users WHERE stack_auth_id = ${stackAuthId}
    `;
    return (result[0] as DbUser) || null;
  } catch (error) {
    console.error("Failed to get user:", error);
    return null;
  }
}

/**
 * Get or create a database user for the current Stack Auth session
 */
export async function ensureDbUser(): Promise<DbUser | null> {
  const stackUser = await getCurrentStackUser();
  if (!stackUser) return null;

  // First try to get existing user
  const existingUser = await getDbUserByStackId(stackUser.id);
  if (existingUser) return existingUser;

  // If not found, sync from Stack Auth
  return await syncUserToDatabase(stackUser);
}

/**
 * Transfer system user data to a real user
 * Use when a user signs up and wants to claim pre-existing data
 */
export async function claimSystemUserData(
  targetUserId: string
): Promise<{ projects: number; documents: number; conversations: number }> {
  try {
    const result = await sql`
      SELECT * FROM transfer_system_user_data(${targetUserId}::UUID, true)
    `;
    return {
      projects: result[0]?.projects_transferred || 0,
      documents: result[0]?.documents_transferred || 0,
      conversations: result[0]?.conversations_transferred || 0,
    };
  } catch (error) {
    console.error("Failed to claim system user data:", error);
    return { projects: 0, documents: 0, conversations: 0 };
  }
}

/**
 * Check if this is the first user (for claiming system data)
 */
export async function isFirstRealUser(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM users
      WHERE stack_auth_id != 'system'
    `;
    return result[0]?.count === 0 || result[0]?.count === "0";
  } catch (error) {
    console.error("Failed to check first user:", error);
    return false;
  }
}
