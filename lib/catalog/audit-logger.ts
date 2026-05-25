/**
 * Audit logger for catalog scan events — Idea H Tier 1.
 *
 * Centralizes writes to `catalog_scan_events`. Every scan trigger (including
 * skipped ones) produces exactly one row here. Powers "what changed between
 * SHA-A and SHA-B?" queries natively + audit of filter decisions.
 */

import { sql } from '@/lib/db/client'
import type { ScanType, ScanTrigger } from './types'

export interface LogScanEventInput {
  userId: string
  projectId?: string | null
  commitSha?: string | null
  branch?: string | null
  scanType: ScanType
  scannedFiles?: string[]
  skipReason?: string | null
  surfacesAdded?: string[]   // UUIDs
  surfacesModified?: string[]
  surfacesRemoved?: string[]
  scanDurationMs?: number | null
  triggeredBy: ScanTrigger
  metadata?: Record<string, unknown>
}

/**
 * Append a scan event row. Returns the event id.
 */
export async function logScanEvent(input: LogScanEventInput): Promise<string> {
  const r = await sql`
    INSERT INTO catalog_scan_events (
      project_id, commit_sha, branch,
      scan_type, scanned_files, skip_reason,
      surfaces_added, surfaces_modified, surfaces_removed,
      scan_duration_ms, triggered_by,
      user_id, metadata
    ) VALUES (
      ${input.projectId ?? null},
      ${input.commitSha ?? null},
      ${input.branch ?? null},
      ${input.scanType},
      ${input.scannedFiles ?? []},
      ${input.skipReason ?? null},
      ${input.surfacesAdded ?? []},
      ${input.surfacesModified ?? []},
      ${input.surfacesRemoved ?? []},
      ${input.scanDurationMs ?? null},
      ${input.triggeredBy},
      ${input.userId},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING id
  `
  return r[0].id as string
}

/**
 * Quick check: was there a scan event for this commit? Used by webhooks to
 * idempotency-skip a re-delivery from GitHub/Vercel.
 */
export async function eventExistsForCommit(
  userId: string,
  commitSha: string,
  triggeredBy: ScanTrigger
): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM catalog_scan_events
    WHERE user_id = ${userId}
      AND commit_sha = ${commitSha}
      AND triggered_by = ${triggeredBy}
    LIMIT 1
  `
  return r.length > 0
}
