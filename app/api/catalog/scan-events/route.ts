/**
 * /api/catalog/scan-events — Idea H Tier 1 immutable audit log
 *
 * GET list scan events (filter: projectId, commitSha, scanType, triggeredBy, since)
 *     Includes "skipped" events for full observability of the filter decisions.
 *
 * No POST/PATCH/DELETE — this table is append-only by design.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const sp = new URL(request.url).searchParams
    const projectId = sp.get('projectId')
    const commitSha = sp.get('commitSha')
    const scanType = sp.get('scanType')
    const triggeredBy = sp.get('triggeredBy')
    const since = sp.get('since') // ISO datetime
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '100', 10) || 100, 500)

    const rows = await sql`
      SELECT *
      FROM catalog_scan_events
      WHERE user_id = ${userId}
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
        AND (${commitSha}::text IS NULL OR commit_sha = ${commitSha})
        AND (${scanType}::text IS NULL OR scan_type = ${scanType})
        AND (${triggeredBy}::text IS NULL OR triggered_by = ${triggeredBy})
        AND (${since}::timestamptz IS NULL OR scanned_at >= ${since}::timestamptz)
      ORDER BY scanned_at DESC
      LIMIT ${limit}
    `

    // Summary: count by scan_type for the response meta
    const counts = await sql`
      SELECT scan_type, COUNT(*)::int AS n
      FROM catalog_scan_events
      WHERE user_id = ${userId}
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
        AND (${since}::timestamptz IS NULL OR scanned_at >= ${since}::timestamptz)
      GROUP BY scan_type
    `
    const summary: Record<string, number> = { targeted: 0, full: 0, skipped: 0 }
    for (const c of counts) summary[c.scan_type] = c.n

    return successResponse(rows, { total: rows.length, summary })
  } catch (error) {
    console.error('GET /api/catalog/scan-events error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load scan events', 500)
  }
}
