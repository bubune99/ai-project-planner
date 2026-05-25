import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export interface FeatureTemplate {
  id: string
  userId: string
  projectId: string | null
  name: string
  title: string
  category: string | null
  description: string
  steps: unknown[]
  requiredSkills: string[]
  defaultAcceptanceCriteria: string[]
  defaultRisks: string[]
  applicableProtocols: string[]
  defaultPrompts: unknown[]
  insertionStrategy: string
  parallelismHint: number
  status: 'draft' | 'active' | 'deprecated'
  version: number
  supersededByTemplateId: string | null
  promotedFromIdeaId: string | null
  usageCount: number
  successCount: number
  failureCount: number
  lastUsedAt: string | null
  visibility: 'private' | 'project' | 'public'
  metadata: Record<string, unknown>
  documentation5wh: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function transformTemplate(row: Record<string, unknown>): FeatureTemplate {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: row.project_id as string | null,
    name: row.name as string,
    title: row.title as string,
    category: row.category as string | null,
    description: row.description as string,
    steps: (row.steps as unknown[]) || [],
    requiredSkills: (row.required_skills as string[]) || [],
    defaultAcceptanceCriteria: (row.default_acceptance_criteria as string[]) || [],
    defaultRisks: (row.default_risks as string[]) || [],
    applicableProtocols: (row.applicable_protocols as string[]) || [],
    defaultPrompts: (row.default_prompts as unknown[]) || [],
    insertionStrategy: (row.insertion_strategy as string) || 'atomic',
    parallelismHint: (row.parallelism_hint as number) || 1,
    status: row.status as FeatureTemplate['status'],
    version: row.version as number,
    supersededByTemplateId: row.superseded_by_template_id as string | null,
    promotedFromIdeaId: row.promoted_from_idea_id as string | null,
    usageCount: row.usage_count as number,
    successCount: row.success_count as number,
    failureCount: row.failure_count as number,
    lastUsedAt: row.last_used_at as string | null,
    visibility: row.visibility as FeatureTemplate['visibility'],
    metadata: (row.metadata as Record<string, unknown>) || {},
    documentation5wh: (row.documentation_5wh as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * GET /api/feature-templates
 * Query params: status, category, projectId, visibility, search
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const category = searchParams.get('category')
    const projectId = searchParams.get('projectId')
    const visibility = searchParams.get('visibility')
    const search = searchParams.get('search')

    const rows = await sql`
      SELECT *
      FROM feature_templates
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND (${status}::text IS NULL OR status = ${status})
        AND (${category}::text IS NULL OR category = ${category})
        AND (${projectId}::uuid IS NULL OR project_id = ${projectId})
        AND (${visibility}::text IS NULL OR visibility = ${visibility})
        AND (${search}::text IS NULL
          OR name ILIKE ${'%' + (search ?? '') + '%'}
          OR title ILIKE ${'%' + (search ?? '') + '%'}
          OR description ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY updated_at DESC
    `

    const templates = rows.map(r => transformTemplate(r as Record<string, unknown>))
    const counts = {
      draft: templates.filter(t => t.status === 'draft').length,
      active: templates.filter(t => t.status === 'active').length,
      deprecated: templates.filter(t => t.status === 'deprecated').length,
      total: templates.length,
    }
    return successResponse(templates, { counts } as any)
  } catch (error) {
    console.error('GET /api/feature-templates error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load feature templates', 500)
  }
}

/**
 * POST /api/feature-templates
 * Body: { name (required), title (required), description (required), rationale (required),
 *         steps?, requiredSkills?, defaultAcceptanceCriteria?, defaultRisks?,
 *         applicableProtocols?, defaultPrompts?, category?, status?, visibility?, projectId? }
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext
    const body = await request.json()
    const {
      name, title, description, category, status, visibility, projectId,
      steps, requiredSkills, defaultAcceptanceCriteria, defaultRisks,
      applicableProtocols, defaultPrompts, insertionStrategy, parallelismHint,
      rationale,
    } = body

    if (!name?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'name is required', 400)
    if (!title?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'title is required', 400)
    if (!description?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'description is required', 400)
    if (!rationale?.trim() && !body?.documentation_5wh?.why?.rationale?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'rationale is required', 400)
    }

    const safeStatus = ['draft', 'active', 'deprecated'].includes(status) ? status : 'active'
    const safeVisibility = ['private', 'project', 'public'].includes(visibility) ? visibility : 'private'
    const safeInsertion = ['atomic', 'extends', 'replaces', 'enriches'].includes(insertionStrategy)
      ? insertionStrategy
      : 'atomic'

    if (projectId) {
      const hasAccess = await verifyProjectOwnership(projectId, userId)
      if (!hasAccess) {
        return errorResponse(ErrorCodes.FORBIDDEN, 'You do not have access to this project', 403)
      }
    }

    const envelopeResult = buildEnvelopeForWrite(
      { ...body, project_id: projectId },
      { userId, projectId: projectId || undefined, agentId: undefined },
      {
        type: 'feature_template',
        title: title?.trim(),
        summary: description?.slice(0, 200),
        rationale: rationale?.trim() || body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO feature_templates (
        user_id, project_id, name, title, category, description,
        steps, required_skills, default_acceptance_criteria, default_risks,
        applicable_protocols, default_prompts, insertion_strategy, parallelism_hint,
        status, visibility, documentation_5wh
      ) VALUES (
        ${userId},
        ${projectId || null},
        ${name.trim()},
        ${title.trim()},
        ${category?.trim() || null},
        ${description.trim()},
        ${JSON.stringify(steps || [])}::jsonb,
        ${JSON.stringify(requiredSkills || [])},
        ${JSON.stringify(defaultAcceptanceCriteria || [])},
        ${JSON.stringify(defaultRisks || [])},
        ${JSON.stringify(applicableProtocols || [])},
        ${JSON.stringify(defaultPrompts || [])}::jsonb,
        ${safeInsertion},
        ${parallelismHint ?? 1},
        ${safeStatus},
        ${safeVisibility},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(transformTemplate(result[0] as Record<string, unknown>), undefined, 201)
  } catch (error) {
    console.error('POST /api/feature-templates error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create feature template', 500)
  }
}
