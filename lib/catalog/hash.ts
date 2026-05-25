/**
 * Signature normalization + content_hash computation — Idea H Tier 1.
 *
 * The content_hash is the drift detector: if the stored hash matches what we
 * compute from the live code, the catalog row is still accurate. If not, the
 * surface is marked needs_revalidation.
 *
 * Normalization rules:
 * - Object keys sorted alphabetically (stable across JS engines)
 * - Whitespace stripped from string values
 * - Arrays preserved in order (order IS meaningful for some signatures — e.g.
 *   column positions, route params, MCP tool input arg order)
 * - NULL / undefined → omitted (treat as identical to missing key)
 * - Numbers serialized with no trailing zeros
 *
 * sha256 of the normalized JSON serialization = content_hash.
 */

import { createHash } from "crypto"

/**
 * Normalize a value for hashing. Recursive.
 * Returns a value safe to JSON.stringify deterministically.
 */
export function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null
    if (!Number.isFinite(value)) return null
    return value
  }
  if (typeof value === "boolean") return value
  if (Array.isArray(value)) {
    return value
      .map((v) => normalizeForHash(v))
      .filter((v) => v !== undefined)
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(obj).sort()
    for (const k of keys) {
      const norm = normalizeForHash(obj[k])
      if (norm !== undefined) sorted[k] = norm
    }
    return sorted
  }
  return undefined
}

/**
 * Serialize a normalized value to its canonical JSON string.
 * JSON.stringify on the sorted-keys output is deterministic.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalizeForHash(value) ?? null)
}

/**
 * Compute the sha256 of a surface signature.
 * Stable across re-scans of unchanged code.
 */
export function computeContentHash(signature: unknown): string {
  const canonical = canonicalize(signature)
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}

/**
 * Quick comparison: does the live signature match the stored hash?
 */
export function signatureMatches(signature: unknown, storedHash: string | null): boolean {
  if (!storedHash) return false
  return computeContentHash(signature) === storedHash
}
