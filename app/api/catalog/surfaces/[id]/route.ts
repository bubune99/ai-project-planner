/**
 * /api/catalog/surfaces/[id]
 *
 * GET    full surface row
 * PATCH  update mutable fields (status, location, signature, envelope merge)
 *        — if signature is patched, content_hash auto-refreshes
 * DELETE soft-delete (sets deleted_at)
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { mergeEnvelopeForPatch, envelopeForSql } from '@/lib/api/envelope-helpers'
import { computeContentHash } from '@/lib/catalog/hash'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    // id can be either the UUID OR the canonical_id (URL-friendly addressable)
    const rows = await sql`
      SELECT * FROM surfaces
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (id::text = ${id} OR canonical_id = ${id})
      LIMIT 1
    `
    if (!rows.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Surface not found', 404)
    return successResponse(rows[0])
  } catch (error) {
    console.error('GET /api/catalog/surfaces/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load surface', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const body = await request.json()

    const existing = await sql`
      SELECT * FROM surfaces
      WHERE user_id = ${userId} AND deleted_at IS NULL
        AND (id::text = ${id} OR canonical_id = ${id})
      LIMIT 1
    `
    if (!existing.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Surface not found', 404)
    const row = existing[0]

    // Envelope merge
    const mergeResult = mergeEnvelopeForPatch(
      row.documentation_5wh,
      body,
      { userId, projectId: row.project_id || undefined },
      {
        type: 'surface',
        title: row.canonical_id,
        summary: `${row.kind} surface: ${row.canonical_id}`,
        rationale: body?.documentation_5wh?.why?.rationale || `PATCH via /api/catalog/surfaces`,
      }
    )
    if (!mergeResult.ok) return mergeResult.response

    // Mutable fields
    const newLocation = body.location !== undefined
      ? { ...row.location, ...body.location }
      : row.location
    const newSignature = body.signature !== undefined ? body.signature : row.signature
    const newContentHash = body.signature !== undefined
      ? computeContentHash(newSignature)
      : row.content_hash
    const newStatus = body.status ?? row.status
    const newLastSeenCommitSha = body.last_seen_commit_sha ?? row.last_seen_commit_sha
    const newDeprecatedInCommitSha = body.deprecated_in_commit_sha ?? row.deprecated_in_commit_sha
    const newLastVerifiedAt = body.last_verified_at ?? new Date().toISOString()
    const newLastVerifiedMethod = body.last_verified_method ?? row.last_verified_method

    const result = await sql`
      UPDATE surfaces
         SET location = ${JSON.stringify(newLocation)}::jsonb,
             signature = ${JSON.stringify(newSignature)}::jsonb,
             content_hash = ${newContentHash},
             status = ${newStatus},
             last_seen_commit_sha = ${newLastSeenCommitSha},
             deprecated_in_commit_sha = ${newDeprecatedInCommitSha},
             last_verified_at = ${newLastVerifiedAt},
             last_verified_method = ${newLastVerifiedMethod},
             documentation_5wh = ${envelopeForSql(mergeResult.envelope)}::jsonb,
             updated_at = NOW()
       WHERE id = ${row.id} AND user_id = ${userId}
       RETURNING *
    `
    return successResponse(result[0])
  } catch (error) {
    console.error('PATCH /api/catalog/surfaces/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to update surface', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id } = await params
    const result = await sql`
      UPDATE surfaces
         SET deleted_at = NOW(), status = 'deprecated'
       WHERE user_id = ${userId} AND deleted_at IS NULL
         AND (id::text = ${id} OR canonical_id = ${id})
       RETURNING id, canonical_id
    `
    if (!result.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Surface not found', 404)
    return successResponse({ id: result[0].id, canonical_id: result[0].canonical_id, deleted: true })
  } catch (error) {
    console.error('DELETE /api/catalog/surfaces/[id] error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to delete surface', 500)
  }
}
