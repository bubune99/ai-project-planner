/**
 * Auth compatibility types for chatsdk components
 * These stub types replace next-auth types since this project uses @stackframe/stack
 */

// Stub User type compatible with next-auth's User
export type User = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

// Stub Session type compatible with next-auth's Session
export type Session = {
  user: User & {
    type?: "guest" | "regular" | "premium";
  };
  expires?: string;
};

// Re-export for convenience
export type { User as NextAuthUser, Session as NextAuthSession };
