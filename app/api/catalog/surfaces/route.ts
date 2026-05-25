/**
 * /api/catalog/surfaces — Idea H Tier 1 CRUD
 *
 * GET  list surfaces with filters (kind, projectId, status, search, includeDeleted)
 * POST register a new surface (manual or via agent declaration)
 *
 * See memory: idea-h-catalog-first
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'
import { computeContentHash } from '@/lib/catalog/hash'
import { SURFACE_KINDS } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth

    const sp = new URL(request.url).searchParams
    const kind = sp.get('kind')
    const projectId = sp.get('projectId')
    const status = sp.get('status')
    const search = sp.get('search')
    const includeDeleted = sp.get('includeDeleted') === '1'
    const limit = Math.min(Number.parseInt(sp.get('limit') ?? '100', 10) || 100, 500)
    const offset = Math.max(Number.parseInt(sp.get('offset') ?? '0', 10) || 0, 0)

    if (kind && !SURFACE_KINDS.includes(kind as never)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `kind must be one of: ${SURFACE_KINDS.join(', ')}`,
        400
      )
    }

    const rows = await sql`
      SELECT *
      FROM surfaces
      WHERE user_id = ${userId}
        AND (${includeDeleted}::boolean OR deleted_at IS NULL)
        AND (${kind}::text IS NULL OR kind = ${kind})
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
        AND (${status}::text IS NULL OR status = ${status})
        AND (${search}::text IS NULL OR canonical_id ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    const total = await sql`
      SELECT COUNT(*)::int AS n FROM surfaces
      WHERE user_id = ${userId}
        AND (${includeDeleted}::boolean OR deleted_at IS NULL)
        AND (${kind}::text IS NULL OR kind = ${kind})
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
        AND (${status}::text IS NULL OR status = ${status})
        AND (${search}::text IS NULL OR canonical_id ILIKE ${'%' + (search ?? '') + '%'})
    `
    return successResponse(rows, { total: total[0].n, limit, offset })
  } catch (error) {
    console.error('GET /api/catalog/surfaces error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to list surfaces', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const body = await request.json()

    const {
      canonical_id,
      kind,
      project_id,
      location,
      signature,
      first_seen_commit_sha,
      last_seen_commit_sha,
      status,
      auto_detected_by,
      last_verified_method,
    } = body

    if (!canonical_id?.trim() || !kind) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'canonical_id and kind are required',
        400
      )
    }
    if (!SURFACE_KINDS.includes(kind)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `kind must be one of: ${SURFACE_KINDS.join(', ')}`,
        400
      )
    }

    const contentHash = signature ? computeContentHash(signature) : null
    const now = new Date().toISOString()

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: project_id || undefined },
      {
        type: 'surface',
        title: canonical_id,
        summary: `${kind} surface: ${canonical_id}`,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          `Registered ${kind} surface via /api/catalog/surfaces`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    try {
      const result = await sql`
        INSERT INTO surfaces (
          canonical_id, kind, project_id,
          location, signature, content_hash,
          first_seen_commit_sha, last_seen_commit_sha,
          status, auto_detected_by, last_verified_at, last_verified_method,
          user_id, documentation_5wh
        ) VALUES (
          ${canonical_id.trim()}, ${kind}, ${project_id ?? null},
          ${JSON.stringify(location ?? {})}::jsonb,
          ${JSON.stringify(signature ?? {})}::jsonb,
          ${contentHash},
          ${first_seen_commit_sha ?? null},
          ${last_seen_commit_sha ?? first_seen_commit_sha ?? null},
          ${status ?? 'fresh'},
          ${auto_detected_by ?? 'manual'},
          ${now},
          ${last_verified_method ?? 'manual'},
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
          `Surface with canonical_id '${canonical_id}' already exists for this user`,
          409
        )
      }
      throw err
    }
  } catch (error) {
    console.error('POST /api/catalog/surfaces error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to register surface', 500)
  }
}
