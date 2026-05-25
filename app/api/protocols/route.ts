import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'
import { buildEnvelopeForWrite, envelopeForSql } from '@/lib/api/envelope-helpers'

export const dynamic = 'force-dynamic'

export interface Protocol {
  id: string
  userId: string
  projectId: string | null
  name: string
  title: string
  category: string | null
  description: string
  triggerEvent: string
  ruleBody: string
  violationSeverity: 'info' | 'warning' | 'error' | 'fatal'
  autoAction: string | null
  appliesToTypes: string[]
  appliesToCategories: string[]
  status: 'draft' | 'active' | 'deprecated'
  version: number
  supersededByProtocolId: string | null
  triggeredCount: number
  violatedCount: number
  blockedCount: number
  lastTriggeredAt: string | null
  visibility: 'private' | 'project' | 'public'
  metadata: Record<string, unknown>
  documentation5wh: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function transformProtocol(row: Record<string, unknown>): Protocol {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: row.project_id as string | null,
    name: row.name as string,
    title: row.title as string,
    category: row.category as string | null,
    description: row.description as string,
    triggerEvent: row.trigger_event as string,
    ruleBody: row.rule_body as string,
    violationSeverity: row.violation_severity as Protocol['violationSeverity'],
    autoAction: row.auto_action as string | null,
    appliesToTypes: (row.applies_to_types as string[]) || [],
    appliesToCategories: (row.applies_to_categories as string[]) || [],
    status: row.status as Protocol['status'],
    version: row.version as number,
    supersededByProtocolId: row.superseded_by_protocol_id as string | null,
    triggeredCount: row.triggered_count as number,
    violatedCount: row.violated_count as number,
    blockedCount: row.blocked_count as number,
    lastTriggeredAt: row.last_triggered_at as string | null,
    visibility: row.visibility as Protocol['visibility'],
    metadata: (row.metadata as Record<string, unknown>) || {},
    documentation5wh: (row.documentation_5wh as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * GET /api/protocols
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
      FROM protocols
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

    const protocols = rows.map(r => transformProtocol(r as Record<string, unknown>))
    const counts = {
      draft: protocols.filter(p => p.status === 'draft').length,
      active: protocols.filter(p => p.status === 'active').length,
      deprecated: protocols.filter(p => p.status === 'deprecated').length,
      total: protocols.length,
    }
    return successResponse(protocols, { counts } as any)
  } catch (error) {
    console.error('GET /api/protocols error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to load protocols', 500)
  }
}

/**
 * POST /api/protocols
 * Body: { name (required), title (required), description (required),
 *         triggerEvent (required), ruleBody (required), rationale (required),
 *         violationSeverity?, autoAction?, appliesToTypes?, appliesToCategories?,
 *         category?, status?, visibility?, projectId? }
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
      triggerEvent, ruleBody, violationSeverity, autoAction,
      appliesToTypes, appliesToCategories, rationale,
    } = body

    if (!name?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'name is required', 400)
    if (!title?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'title is required', 400)
    if (!description?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'description is required', 400)
    if (!triggerEvent?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'triggerEvent is required', 400)
    if (!ruleBody?.trim()) return errorResponse(ErrorCodes.VALIDATION_ERROR, 'ruleBody is required', 400)
    if (!rationale?.trim() && !body?.documentation_5wh?.why?.rationale?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'rationale is required', 400)
    }

    const safeStatus = ['draft', 'active', 'deprecated'].includes(status) ? status : 'active'
    const safeVisibility = ['private', 'project', 'public'].includes(visibility) ? visibility : 'private'
    const safeSeverity = ['info', 'warning', 'error', 'fatal'].includes(violationSeverity)
      ? violationSeverity
      : 'warning'

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
        type: 'protocol',
        title: title?.trim(),
        summary: description?.slice(0, 200),
        rationale: rationale?.trim() || body?.documentation_5wh?.why?.rationale,
      },
      'legacy'
    )
    if (!envelopeResult.ok) return envelopeResult.response

    const result = await sql`
      INSERT INTO protocols (
        user_id, project_id, name, title, category, description,
        trigger_event, rule_body, violation_severity, auto_action,
        applies_to_types, applies_to_categories,
        status, visibility, documentation_5wh
      ) VALUES (
        ${userId},
        ${projectId || null},
        ${name.trim()},
        ${title.trim()},
        ${category?.trim() || null},
        ${description.trim()},
        ${triggerEvent.trim()},
        ${ruleBody.trim()},
        ${safeSeverity},
        ${autoAction?.trim() || null},
        ${JSON.stringify(appliesToTypes || [])},
        ${JSON.stringify(appliesToCategories || [])},
        ${safeStatus},
        ${safeVisibility},
        ${envelopeForSql(envelopeResult.envelope)}::jsonb
      )
      RETURNING *
    `
    return successResponse(transformProtocol(result[0] as Record<string, unknown>), undefined, 201)
  } catch (error) {
    console.error('POST /api/protocols error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create protocol', 500)
  }
}
