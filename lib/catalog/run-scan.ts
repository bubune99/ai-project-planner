/**
 * Canonical scan-and-persist orchestrator — Idea H Wave 4.
 *
 * One place where "given a scan request, do the scan, diff against current DB,
 * apply inserts/updates/deprecations, and write the audit event" lives.
 *
 * Called by:
 *   - app/api/catalog/webhooks/github/route.ts (on git push)
 *   - app/api/catalog/webhooks/vercel-deploy/route.ts (post-deploy belt-and-suspenders)
 *   - app/mcp/route.ts catalog_scan_now tool (manual)
 *
 * Returns a structured result that the caller can either log + return to a user
 * (MCP) or include in a webhook response (HTTP).
 */

import { sql } from "@/lib/db/client"
import type { ScanType, ScanTrigger, Surface, SurfaceDependency } from "./types"

export interface RunScanInput {
  userId: string
  projectRoot: string
  /** Optional: relative file paths to scan. If omitted, full tree. */
  files?: string[]
  /** 'targeted' or 'full'. Must match the files arg (targeted requires files non-empty). */
  scope: "targeted" | "full"
  /** Optional commit_sha to stamp on new/modified surfaces */
  commitSha?: string | null
  /** Optional branch for the audit event */
  branch?: string | null
  /** What triggered this run (drives the catalog_scan_events.triggered_by column) */
  triggeredBy: ScanTrigger
  /** Optional project_id to scope catalog rows */
  projectId?: string | null
  /** Optional metadata to attach to the scan event */
  eventMetadata?: Record<string, unknown>
}

export interface RunScanResult {
  scanEventId: string
  scanType: ScanType
  scannedFilesCount: number
  surfacesAdded: string[]
  surfacesModified: string[]
  surfacesRemoved: string[]
  warnings: string[]
  scanDurationMs: number
}

/**
 * Run a catalog scan end-to-end. Always writes a catalog_scan_events row
 * (even on failure — scan_type='skipped' + skip_reason).
 */
export async function runCatalogScan(input: RunScanInput): Promise<RunScanResult> {
  const t0 = Date.now()
  const userId = input.userId
  const triggeredBy = input.triggeredBy
  const projectId = input.projectId ?? null
  const eventMetadata = input.eventMetadata ?? {}

  if (input.scope === "targeted" && (!input.files || input.files.length === 0)) {
    const { logScanEvent } = await import("./audit-logger")
    const eventId = await logScanEvent({
      userId,
      projectId,
      commitSha: input.commitSha,
      branch: input.branch,
      scanType: "skipped",
      scannedFiles: [],
      skipReason: "scope='targeted' with empty files list — nothing to scan",
      triggeredBy,
      scanDurationMs: 0,
      metadata: eventMetadata,
    })
    return {
      scanEventId: eventId,
      scanType: "skipped",
      scannedFilesCount: 0,
      surfacesAdded: [],
      surfacesModified: [],
      surfacesRemoved: [],
      warnings: ["targeted scan with empty files list"],
      scanDurationMs: Date.now() - t0,
    }
  }

  // 1. Run the AST scanner
  let scanResult
  try {
    const { scanPaths } = await import("./scan")
    scanResult = await scanPaths({
      projectRoot: input.projectRoot,
      files: input.scope === "targeted" ? input.files : undefined,
      commitSha: input.commitSha ?? undefined,
      branch: input.branch ?? undefined,
    })
  } catch (err) {
    const { logScanEvent } = await import("./audit-logger")
    const reason = err instanceof Error ? err.message : "Unknown scan error"
    const eventId = await logScanEvent({
      userId,
      projectId,
      commitSha: input.commitSha,
      branch: input.branch,
      scanType: "skipped",
      scannedFiles: input.files ?? [],
      skipReason: `scan failed: ${reason}`,
      triggeredBy,
      scanDurationMs: Date.now() - t0,
      metadata: { ...eventMetadata, scan_error: true },
    })
    return {
      scanEventId: eventId,
      scanType: "skipped",
      scannedFilesCount: 0,
      surfacesAdded: [],
      surfacesModified: [],
      surfacesRemoved: [],
      warnings: [reason],
      scanDurationMs: Date.now() - t0,
    }
  }

  // 2. Fetch current catalog state for diffing
  const existingSurfacesRows = await sql`
    SELECT id, canonical_id, kind, project_id, location, signature,
           content_hash, status, auto_detected_by, last_verified_at,
           last_verified_method, first_seen_commit_sha, last_seen_commit_sha,
           deprecated_in_commit_sha, user_id, created_at, updated_at, deleted_at,
           metadata, documentation_5wh
    FROM surfaces
    WHERE user_id = ${userId} AND deleted_at IS NULL
  `
  const existingSurfaces = existingSurfacesRows as unknown as Surface[]

  const existingDepRows = await sql`
    SELECT id, from_surface_id, to_surface_id, kind, confidence,
           auto_detected_by, first_seen_commit_sha, last_seen_commit_sha,
           deprecated_in_commit_sha, user_id, created_at, updated_at, deleted_at,
           documentation_5wh, metadata
    FROM surface_dependencies
    WHERE user_id = ${userId} AND deleted_at IS NULL
  `
  const existingDeps = existingDepRows as unknown as SurfaceDependency[]

  // 3. Diff
  const { diffScanAgainstCurrent } = await import("./persist")
  const diff = diffScanAgainstCurrent({
    scanResult,
    existingSurfaces,
    existingDependencies: existingDeps,
  })

  // 4. Apply diff to DB
  const { computeContentHash } = await import("./hash")
  const now = new Date().toISOString()
  const autoDetectedBy = input.scope === "full" ? "scan_full" : "scan_targeted"
  const surfacesAdded: string[] = []
  const surfacesModified: string[] = []
  const surfacesRemoved: string[] = []

  // 4a. Inserts (with ON CONFLICT for concurrent-scan safety)
  for (const detected of diff.surfacesToInsert) {
    const hash = computeContentHash(detected.signature)
    const insertRows = await sql`
      INSERT INTO surfaces (
        canonical_id, kind, project_id, location, signature, content_hash,
        first_seen_commit_sha, last_seen_commit_sha,
        status, auto_detected_by, last_verified_at, last_verified_method,
        user_id, created_at, updated_at, documentation_5wh, metadata
      ) VALUES (
        ${detected.canonical_id}, ${detected.kind}, ${projectId},
        ${JSON.stringify(detected.location ?? {})}::jsonb,
        ${JSON.stringify(detected.signature ?? {})}::jsonb,
        ${hash},
        ${input.commitSha ?? null}, ${input.commitSha ?? null},
        'needs_revalidation',
        ${autoDetectedBy},
        ${now}, ${autoDetectedBy},
        ${userId}, ${now}, ${now},
        '{}'::jsonb,
        ${JSON.stringify({ scan_scope: input.scope, triggered_by: triggeredBy })}::jsonb
      )
      ON CONFLICT (user_id, canonical_id) DO NOTHING
      RETURNING id
    `
    if (insertRows[0]) surfacesAdded.push(insertRows[0].id as string)
  }

  // 4b. Updates
  for (const { existing_id, detected } of diff.surfacesToUpdate) {
    const hash = computeContentHash(detected.signature)
    await sql`
      UPDATE surfaces
         SET signature = ${JSON.stringify(detected.signature ?? {})}::jsonb,
             content_hash = ${hash},
             last_seen_commit_sha = ${input.commitSha ?? null},
             status = 'needs_revalidation',
             auto_detected_by = ${autoDetectedBy},
             last_verified_at = ${now},
             last_verified_method = ${autoDetectedBy},
             updated_at = ${now}
       WHERE id = ${existing_id}::uuid AND user_id = ${userId}
    `
    surfacesModified.push(existing_id)
  }

  // 4c. Deprecations (persist.ts only populates this on full scans)
  for (const surfaceId of diff.surfacesToDeprecate) {
    await sql`
      UPDATE surfaces
         SET status = 'deprecated',
             deprecated_in_commit_sha = ${input.commitSha ?? null},
             deleted_at = ${now},
             updated_at = ${now}
       WHERE id = ${surfaceId}::uuid AND user_id = ${userId}
    `
    surfacesRemoved.push(surfaceId)
  }

  // 4d. Detected dependencies — resolve canonical_id → surface UUID then upsert
  // (Reads back any just-inserted surfaces so newly-discovered deps can link to them.)
  if (diff.dependenciesToInsert.length > 0) {
    const refreshedSurfaces = await sql`
      SELECT id, canonical_id FROM surfaces
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `
    const idByCanonical = new Map<string, string>()
    for (const s of refreshedSurfaces) {
      idByCanonical.set(s.canonical_id as string, s.id as string)
    }

    for (const dep of diff.dependenciesToInsert) {
      const fromId = idByCanonical.get(dep.from_canonical_id)
      const toId = idByCanonical.get(dep.to_canonical_id)
      if (!fromId || !toId || fromId === toId) continue
      await sql`
        INSERT INTO surface_dependencies (
          from_surface_id, to_surface_id, kind, confidence,
          auto_detected_by, first_seen_commit_sha, last_seen_commit_sha,
          user_id, created_at, updated_at,
          documentation_5wh, metadata
        ) VALUES (
          ${fromId}::uuid, ${toId}::uuid, ${dep.kind},
          ${dep.confidence ?? 1.0},
          ${autoDetectedBy},
          ${input.commitSha ?? null}, ${input.commitSha ?? null},
          ${userId}, ${now}, ${now},
          '{}'::jsonb,
          ${JSON.stringify({ scan_scope: input.scope, triggered_by: triggeredBy })}::jsonb
        )
        ON CONFLICT DO NOTHING
      `
    }
  }

  // 5. Write the audit event
  const { logScanEvent } = await import("./audit-logger")
  const scanEventId = await logScanEvent({
    userId,
    projectId,
    commitSha: input.commitSha,
    branch: input.branch,
    scanType: input.scope === "full" ? "full" : "targeted",
    scannedFiles: scanResult.scanned_files,
    surfacesAdded,
    surfacesModified,
    surfacesRemoved,
    scanDurationMs: Date.now() - t0,
    triggeredBy,
    metadata: {
      ...eventMetadata,
      warnings_count: scanResult.warnings.length,
    },
  })

  return {
    scanEventId,
    scanType: input.scope === "full" ? "full" : "targeted",
    scannedFilesCount: scanResult.scanned_files.length,
    surfacesAdded,
    surfacesModified,
    surfacesRemoved,
    warnings: scanResult.warnings,
    scanDurationMs: Date.now() - t0,
  }
}
