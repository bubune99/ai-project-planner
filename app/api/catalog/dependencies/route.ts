/**
 * /api/catalog/dependencies — Idea H Tier 1 typed edges
 *
 * GET  list dependencies (filter: fromSurfaceId, toSurfaceId, kind)
 * POST declare a new dependency (from agent or manual)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'
import { DEPENDENCY_KINDS } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const sp = new URL(request.url).searchParams
    const fromSurfaceId = sp.get('fromSurfaceId')
    const toSurfaceId = sp.get('toSurfaceId')
    const kind = sp.get('kind')
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '500', 10) || 500, 2000)

    if (kind && !DEPENDENCY_KINDS.includes(kind as never)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `kind must be one of: ${DEPENDENCY_KINDS.join(', ')}`,
        400
      )
    }

    const rows = await sql`
      SELECT *
      FROM surface_dependencies
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (${fromSurfaceId}::uuid IS NULL OR from_surface_id = ${fromSurfaceId})
        AND (${toSurfaceId}::uuid IS NULL OR to_surface_id = ${toSurfaceId})
        AND (${kind}::text IS NULL OR kind = ${kind})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return successResponse(rows, { total: rows.length })
  } catch (error) {
    console.error('GET /api/catalog/dependencies error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load dependencies', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const body = await request.json()
    const {
      from_surface_id,
      to_surface_id,
      kind,
      confidence,
      auto_detected_by,
      first_seen_commit_sha,
      last_seen_commit_sha,
    } = body

    if (!from_surface_id || !to_surface_id || !kind) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'from_surface_id, to_surface_id, kind are required',
        400
      )
    }
    if (!DEPENDENCY_KINDS.includes(kind)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `kind must be one of: ${DEPENDENCY_KINDS.join(', ')}`,
        400
      )
    }
    if (from_surface_id === to_surface_id) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'from_surface_id and to_surface_id must differ (no self-loops)',
        400
      )
    }

    // Verify both surfaces exist + belong to this user
    const surfaceCheck = await sql`
      SELECT id FROM surfaces
      WHERE user_id = ${userId} AND deleted_at IS NULL
        AND id IN (${from_surface_id}::uuid, ${to_surface_id}::uuid)
    `
    if (surfaceCheck.length < 2) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        'One or both surfaces not found (or not owned)',
        404
      )
    }

    const safeConfidence = typeof confidence === 'number' && confidence >= 0 && confidence <= 1
      ? confidence
      : 1.0

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId },
      {
        type: 'surface_dependency',
        title: `${kind} edge`,
        summary: `${from_surface_id.slice(0, 8)} → ${kind} → ${to_surface_id.slice(0, 8)}`,
        rationale: body?.documentation_5wh?.why?.rationale || `Declared ${kind} dependency`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    try {
      const result = await sql`
        INSERT INTO surface_dependencies (
          from_surface_id, to_surface_id, kind,
          confidence, auto_detected_by,
          first_seen_commit_sha, last_seen_commit_sha,
          user_id, documentation_5wh
        ) VALUES (
          ${from_surface_id}::uuid, ${to_surface_id}::uuid, ${kind},
          ${safeConfidence}, ${auto_detected_by ?? 'manual'},
          ${first_seen_commit_sha ?? null},
          ${last_seen_commit_sha ?? first_seen_commit_sha ?? null},
          ${userId},
          ${envelopeForSql(envelopeResult.envelope)}::jsonb
        )
        RETURNING *
      `
      return successResponse(result[0], undefined, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return errorResponse(
          ErrorCodes.CONFLICT,
          'Dependency already exists (same from/to/kind for this user)',
          409
        )
      }
      throw err
    }
  } catch (error) {
    console.error('POST /api/catalog/dependencies error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create dependency', 500)
  }
}
