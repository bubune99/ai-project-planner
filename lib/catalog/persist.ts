/**
 * Catalog persistence diffing — Idea H Wave 1.
 *
 * This module is the ONLY layer between the scanner output and the DB.
 * It computes what needs to be inserted, updated, or soft-deprecated —
 * but does NOT touch the DB itself. The caller (an API route or MCP handler)
 * executes the actual SQL.
 *
 * Key invariants enforced here:
 *
 *   1. Targeted scans NEVER deprecate.
 *      A targeted scan sees only the files it was told to scan. If a surface
 *      doesn't appear in the scan output, that could mean it wasn't scanned —
 *      NOT that it was removed. Only full scans have the authority to deprecate.
 *
 *   2. content_hash is the change detector.
 *      If the current hash matches the stored hash, the surface is "unchanged".
 *      If different, it's "modified" (needs a DB update + status flip to
 *      'needs_revalidation').
 *
 *   3. New surfaces (canonical_id not in DB) are "inserted".
 *
 *   4. Full-scan surfaces in DB but absent from scan output are "deprecated"
 *      — their deprecated_in_commit_sha gets set by the caller.
 *
 * No DB calls here. No side effects. Pure diff logic.
 */

import type {
  Surface,
  SurfaceDependency,
  ScanResult,
  DetectedSurface,
  DetectedDependency,
  ScanType,
} from "./types"
import { computeContentHash } from "./hash"

// ============================================================================
// Output types
// ============================================================================

export interface SurfaceUpsert {
  canonical_id: string
  kind: string
  location: Record<string, unknown>
  signature: Record<string, unknown>
  content_hash: string
  to_be: "inserted" | "modified" | "unchanged"
  /** Present when to_be === 'modified'; the existing row's UUID */
  existing_id?: string
}

export interface DependencyUpsert {
  from_canonical_id: string
  to_canonical_id: string
  kind: string
  confidence: number
  to_be: "inserted" | "unchanged"
}

export interface DiffResult {
  surfacesToInsert: DetectedSurface[]
  surfacesToUpdate: Array<{ existing_id: string; detected: DetectedSurface }>
  /**
   * Surface IDs (UUIDs) to mark deprecated.
   * ALWAYS EMPTY for targeted scans — only full scans can deprecate.
   */
  surfacesToDeprecate: string[]
  dependenciesToInsert: DetectedDependency[]
  /**
   * Dependency IDs (UUIDs) to mark deprecated.
   * ALWAYS EMPTY for targeted scans.
   */
  dependenciesToDeprecate: string[]
}

// ============================================================================
// Main diff function
// ============================================================================

/**
 * Diff the scanner output against the current DB state.
 *
 * @param opts.scanResult      - What the scanner found
 * @param opts.existingSurfaces - Current Surface rows from the DB for the
 *                               same scope (kinds + file paths). Callers should
 *                               pre-filter to just the relevant subset to avoid
 *                               accidentally deprecating surfaces from other files.
 * @param opts.existingDependencies - Current SurfaceDependency rows from DB.
 */
export function diffScanAgainstCurrent(opts: {
  scanResult: ScanResult
  existingSurfaces: Surface[]
  existingDependencies: SurfaceDependency[]
}): DiffResult {
  const { scanResult, existingSurfaces, existingDependencies } = opts
  const isFullScan = scanResult.scan_type === "full"

  // Index existing surfaces by canonical_id for O(1) lookup
  const existingByCanonical = new Map<string, Surface>()
  for (const s of existingSurfaces) {
    existingByCanonical.set(s.canonical_id, s)
  }

  // Track canonical_ids seen in this scan (for deprecation calculation)
  const seenCanonicalIds = new Set<string>()

  const surfacesToInsert: DetectedSurface[] = []
  const surfacesToUpdate: Array<{ existing_id: string; detected: DetectedSurface }> = []

  for (const detected of scanResult.detected_surfaces) {
    seenCanonicalIds.add(detected.canonical_id)
    const existing = existingByCanonical.get(detected.canonical_id)

    const newHash = computeContentHash(detected.signature)

    if (!existing) {
      // New surface — insert
      surfacesToInsert.push(detected)
    } else {
      // Surface exists — compare hashes
      const storedHash = existing.content_hash
      if (storedHash !== newHash) {
        // Content changed — update
        surfacesToUpdate.push({ existing_id: existing.id, detected })
      }
      // else: unchanged — nothing to do
    }
  }

  // Deprecation: only for full scans
  const surfacesToDeprecate: string[] = []
  if (isFullScan) {
    for (const existing of existingSurfaces) {
      if (
        !seenCanonicalIds.has(existing.canonical_id) &&
        existing.status !== "deprecated" &&
        !existing.deleted_at
      ) {
        surfacesToDeprecate.push(existing.id)
      }
    }
  }
  // For targeted scans: surfacesToDeprecate stays empty — invariant enforced

  // ---- Dependency diffing ----

  // Index existing deps by (from_surface_id, to_surface_id, kind)
  // We match on canonical_ids here; caller must resolve surface UUIDs ↔ canonical_ids
  // For simplicity at Wave 1: we diff by (from_canonical, to_canonical, kind) using a
  // string key. The caller is responsible for resolving UUIDs after insert.
  const existingDepKeys = new Set<string>()
  for (const dep of existingDependencies) {
    // Deps have UUID-based from/to at the DB layer. We can't directly compare with
    // canonical_ids from the scan. Wave 2 will add canonical resolution here.
    // For now we key on from_surface_id+to_surface_id+kind (UUID form).
    existingDepKeys.add(`${dep.from_surface_id}|${dep.to_surface_id}|${dep.kind}`)
  }

  // For detected dependencies, we only know canonical_ids (no UUIDs yet).
  // The caller must do a "find surface by canonical_id" lookup and then check
  // for existing dep rows. Wave 1: we insert all detected deps and rely on
  // DB UNIQUE constraint (from_surface_id, to_surface_id, kind, user_id) to
  // prevent duplicates. We emit all as "to insert" and let the DB UPSERT handle it.
  const dependenciesToInsert: DetectedDependency[] = scanResult.detected_dependencies

  // Dependency deprecation: only for full scans (same invariant as surfaces)
  const dependenciesToDeprecate: string[] = []
  if (isFullScan) {
    // Emit all existing dep IDs not seen in scan — caller can match after resolving canonicals
    // Wave 1: we can't resolve without UUIDs here, so we return empty and let
    // the caller decide based on the full canonical set. See Wave 2 note.
    // This is a known gap: dependency deprecation in full scans needs UUID resolution.
    // Flagged in warnings at scan time if needed.
  }

  return {
    surfacesToInsert,
    surfacesToUpdate,
    surfacesToDeprecate,
    dependenciesToInsert,
    dependenciesToDeprecate,
  }
}

// ============================================================================
// Helper: compute hash for a detected surface
// (re-exported so callers can use the same hash function)
// ============================================================================

export { computeContentHash }

// ============================================================================
// Helper: classify scan_type from the options
// ============================================================================

/**
 * Determine the effective scan type from a file list.
 * If files is provided (non-empty), it's targeted. Otherwise full.
 */
export function deriveScanType(files: string[] | undefined): ScanType {
  return files && files.length > 0 ? "targeted" : "full"
}

// ============================================================================
// Helper: build a compact summary of a diff result (for logging / MCP responses)
// ============================================================================

export interface DiffSummary {
  inserted: number
  updated: number
  deprecated: number
  deps_inserted: number
  deps_deprecated: number
}

export function summarizeDiff(diff: DiffResult): DiffSummary {
  return {
    inserted: diff.surfacesToInsert.length,
    updated: diff.surfacesToUpdate.length,
    deprecated: diff.surfacesToDeprecate.length,
    deps_inserted: diff.dependenciesToInsert.length,
    deps_deprecated: diff.dependenciesToDeprecate.length,
  }
}
