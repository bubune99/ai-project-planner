import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export interface Skill {
  id: string
  userId: string
  projectId: string | null
  name: string
  title: string
  category: string | null
  description: string
  whenToUse: string | null
  body: string
  prerequisites: string[]
  provides: string[]
  examples: unknown[]
  status: 'draft' | 'active' | 'deprecated'
  version: number
  supersededBySkillId: string | null
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

function transformSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: row.project_id as string | null,
    name: row.name as string,
    title: row.title as string,
    category: row.category as string | null,
    description: row.description as string,
    whenToUse: row.when_to_use as string | null,
    body: row.body as string,
    prerequisites: (row.prerequisites as string[]) || [],
    provides: (row.provides as string[]) || [],
    examples: (row.examples as unknown[]) || [],
    status: row.status as Skill['status'],
    version: row.version as number,
    supersededBySkillId: row.superseded_by_skill_id as string | null,
    usageCount: row.usage_count as number,
    successCount: row.success_count as number,
    failureCount: row.failure_count as number,
    lastUsedAt: row.last_used_at as string | null,
    visibility: row.visibility as Skill['visibility'],
    metadata: (row.metadata as Record<string, unknown>) || {},
    documentation5wh: (row.documentation_5wh as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * GET /api/skills
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
      FROM skills
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

    const skills = rows.map(transformSkill)
    const counts = {
      draft: skills.filter(s => s.status === 'draft').length,
      active: skills.filter(s => s.status === 'active').length,
      deprecated: skills.filter(s => s.status === 'deprecated').length,
      total: skills.length,
    }
    return successResponse(skills, { counts } as any)
  } catch (error) {
    console.error('GET /api/skills error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load skills', 500)
  }
}

/**
 * POST /api/skills
 * Body: { name (required), title (required), description (required), rationale (required),
 *         body?, category?, status?, visibility?, projectId?, whenToUse?,
 *         prerequisites?, provides?, examples? }
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
      name, title, description, category, status, visibility,
      projectId, whenToUse, body: skillBody, prerequisites, provides, examples,
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
        type: 'skill',
        title: title?.trim(),
        summary: description?.slice(0, 200),
        rationale: rationale?.trim() || body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO skills (
        user_id, project_id, name, title, category, description,
        when_to_use, body, prerequisites, provides, examples,
        status, visibility, documentation_5wh
      ) VALUES (
        ${userId},
        ${projectId || null},
        ${name.trim()},
        ${title.trim()},
        ${category?.trim() || null},
        ${description.trim()},
        ${whenToUse?.trim() || null},
        ${skillBody?.trim() || ''},
        ${JSON.stringify(prerequisites || [])},
        ${JSON.stringify(provides || [])},
        ${JSON.stringify(examples || [])}::jsonb,
        ${safeStatus},
        ${safeVisibility},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(transformSkill(result[0] as Record<string, unknown>), undefined, 201)
  } catch (error) {
    console.error('POST /api/skills error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create skill', 500)
  }
}
