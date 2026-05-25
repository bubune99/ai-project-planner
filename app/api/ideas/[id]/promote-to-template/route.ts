/**
 * POST /api/ideas/[id]/promote-to-template
 *
 * Phase 9 / Idea F3 — promotion flow step 1: idea → feature_template.
 *
 * Reads the idea's facets (especially type='spec_draft' and 'acceptance_criteria' once F2
 * ships those types) and constructs a feature_template. Records 'promoted_from' relation.
 *
 * Body: { name, title, category?, default_acceptance_criteria?[], rationale? }
 *   name + title required; rest derived from idea + facets.
 */

import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    const { userId } = auth
    const { id: ideaId } = await params
    const body = await request.json()

    const { name, title, category, default_acceptance_criteria, projectId } = body
    if (!name?.trim() || !title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'name and title are required', 400)
    }

    // Verify idea ownership
    const idea = await sql`
      SELECT id, user_id, title, description, category, tags, documentation_5wh
      FROM ideas WHERE id = ${ideaId} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (!idea.length) return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)

    // Pull related facets — convert to template fields
    const facets = await sql`
      SELECT id, type, title, content
      FROM idea_facets
      WHERE idea_id = ${ideaId}
      ORDER BY display_order ASC NULLS LAST
    ` as any[]

    // Derive default fields from facets where possible
    const steps: any[] = []
    const acceptanceFromFacets: string[] = Array.isArray(default_acceptance_criteria)
      ? [...default_acceptance_criteria]
      : []
    const risksFromFacets: string[] = []

    for (const f of facets) {
      const content = f.content || {}
      // 'risks' facet → risks list
      if (f.type === 'risks' && Array.isArray(content.items)) {
        for (const r of content.items) {
          if (typeof r === 'string') risksFromFacets.push(r)
          else if (r?.description) risksFromFacets.push(r.description)
        }
      }
      // 'technical_specs' or 'dependencies' could enrich step list (best-effort)
      if (f.type === 'technical_specs' && Array.isArray(content.steps)) {
        for (const s of content.steps) {
          steps.push({
            order: steps.length,
            title: typeof s === 'string' ? s : s?.title || `Step ${steps.length + 1}`,
            skill_ref: typeof s === 'object' ? s?.skill_ref : undefined,
            acceptance: typeof s === 'object' ? s?.acceptance : undefined,
          })
        }
      }
    }

    // If no steps derived from facets, create a single placeholder step
    if (steps.length === 0) {
      steps.push({
        order: 0,
        title: `Implement ${title}`,
        skill_ref: undefined,
        acceptance: undefined,
      })
    }

    // Envelope build
    const envelopeResult = buildEnvelopeForWrite(
      body,
      { userId, projectId: projectId || undefined },
      {
        type: 'feature_template',
        title,
        summary: idea[0].description || title,
        rationale:
          body?.documentation_5wh?.why?.rationale ||
          `Promoted from idea "${idea[0].title}" (${facets.length} facet${facets.length === 1 ? '' : 's'} carried over)`,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    // Insert feature_template
    const tmpl = await sql`
      INSERT INTO feature_templates (
        name, title, category, description, steps,
        default_acceptance_criteria, default_risks,
        promoted_from_idea_id, user_id, project_id,
        documentation_5wh
      ) VALUES (
        ${name.trim()},
        ${title.trim()},
        ${category || idea[0].category},
        ${idea[0].description || ''},
        ${JSON.stringify(steps)}::jsonb,
        ${acceptanceFromFacets},
        ${risksFromFacets},
        ${ideaId},
        ${userId},
        ${projectId || null},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    const template = tmpl[0]

    // Create entity_relation: idea promoted_from → template
    try {
      await sql`
        INSERT INTO entity_relations (
          from_entity_type, from_entity_id, to_entity_type, to_entity_id,
          relation_type, confidence, user_id, created_by_type
        ) VALUES (
          'feature_template', ${template.id}, 'idea', ${ideaId},
          'promoted_from', 1.00, ${userId}, 'system'
        )
        ON CONFLICT DO NOTHING
      `
    } catch (e) {
      console.error('entity_relations insert failed (non-fatal):', e)
    }

    // Update idea lifecycle → 'promoted'
    await sql`UPDATE ideas SET lifecycle = 'promoted', updated_at = NOW() WHERE id = ${ideaId}`

    return successResponse(
      { template, facetsCarriedOver: facets.length, stepsGenerated: steps.length },
      undefined,
      201
    )
  } catch (error) {
    console.error('POST /api/ideas/[id]/promote-to-template error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to promote idea', 500)
  }
}
