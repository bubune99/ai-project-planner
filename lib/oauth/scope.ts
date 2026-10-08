/**
 * OAuth scope parsing — the ONE place both the consent screen and the token
 * endpoint derive scopes from, so what the user approves is exactly what the
 * minted API key gets.
 */

/** Scopes this server supports (mirrors metadata.ts scopes_supported). */
export const SUPPORTED_SCOPES = ["read", "write"] as const
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number]

/**
 * Scopes granted when the client sends no scope (absent, empty or
 * whitespace-only). Changing this is a product decision for the owner.
 */
export const DEFAULT_SCOPES: readonly SupportedScope[] = ["read", "write"]

/**
 * Parse a raw OAuth scope string into the scopes that will be granted.
 * - Tokens other than SUPPORTED_SCOPES are ignored (no code path checks them).
 * - If no supported token remains (absent, empty, whitespace-only, or only
 *   unknown tokens) the result is DEFAULT_SCOPES.
 * - Duplicates removed; order normalised to SUPPORTED_SCOPES order.
 * The consent screen MUST display exactly this result.
 */
export function parseScope(raw: string | null | undefined): SupportedScope[] {
  const tokens = (raw ?? "").split(/\s+/).filter(Boolean)
  const known = SUPPORTED_SCOPES.filter((s) => tokens.includes(s))
  return known.length > 0 ? known : [...DEFAULT_SCOPES]
}

/** Serialise parsed scopes for storage / the token response. */
export function formatScope(scopes: readonly string[]): string {
  return scopes.join(" ")
}
