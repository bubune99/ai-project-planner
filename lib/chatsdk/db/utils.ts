/**
 * Stub database utilities for chatsdk
 */

/**
 * Generate a dummy password for guest users
 */
export function generateDummyPassword(): string {
  return `dummy-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
