/**
 * /api/ideas/[id]/documents
 *
 * Generated documents per idea (business plans, PRDs, pitch decks, tech specs, executive summaries).
 *
 * GET  list documents for an idea (filter: documentType)
 * POST create a new document
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

const VALID_DOCUMENT_TYPES = [
  'business_plan',
  'prd',
  'pitch_deck',
  'tech_spec',
  'executive_summary',
] as const

async function userOwnsIdea(ideaId: string, userId: string): Promise<boolean> {
  const r = await sql`
    SELECT id FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return r.length > 0
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: ideaId } = await params

    if (!(await userOwnsIdea(ideaId, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const documentType = new URL(request.url).searchParams.get('documentType')

    const rows = await sql`
      SELECT *
      FROM idea_documents
      WHERE idea_id = ${ideaId}
        AND (${documentType}::text IS NULL OR document_type = ${documentType})
      ORDER BY document_type ASC, version DESC, created_at DESC
    `
    return successResponse(rows, { total: rows.length })
  } catch (error) {
    console.error('GET /api/ideas/[id]/documents error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load documents', 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: ideaId } = await params

    if (!(await userOwnsIdea(ideaId, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const body = await request.json()
    const {
      documentType,
      title,
      content,
      contentFormat,
      generatedFromFacets,
      generationPrompt,
      previousVersionId,
    } = body

    if (!documentType || !title) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'documentType and title are required',
        400
      )
    }
    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `documentType must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`,
        400
      )
    }

    // Compute next version if this is a revision
    let version = 1
    if (previousVersionId) {
      const prev = await sql`
        SELECT version FROM idea_documents
        WHERE id = ${previousVersionId} AND idea_id = ${ideaId}
      `
      version = (prev[0]?.version ?? 0) + 1
    }

    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId },
      {
        type: 'idea_document',
        title,
        summary: content?.slice(0, 200) || `${documentType} v${version}`,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          `Generated ${documentType} for idea ${ideaId.slice(0, 8)} (v${version})`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO idea_documents (
        idea_id, document_type, title, content, content_format,
        generated_from_facets, generation_prompt, version, previous_version_id,
        documentation_5wh
      ) VALUES (
        ${ideaId},
        ${documentType},
        ${title},
        ${content ?? null},
        ${contentFormat ?? 'markdown'},
        ${generatedFromFacets ?? []},
        ${generationPrompt ?? null},
        ${version},
        ${previousVersionId ?? null},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(result[0], undefined, 201)
  } catch (error) {
    console.error('POST /api/ideas/[id]/documents error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create document', 500)
  }
}
