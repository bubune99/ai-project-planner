import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { ValidationAgentType, ValidationStatus } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend IdeaValidation format
 */
function transformValidation(row: any) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    agentType: row.agent_type as ValidationAgentType,
    status: row.status as ValidationStatus,
    messages: row.messages || [],
    currentFacetId: row.current_facet_id,
    validatedFacetIds: row.validated_facet_ids || [],
    validationScore: row.validation_score,
    blockers: row.blockers || [],
    recommendations: row.recommendations || [],
    agentConfig: row.agent_config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}

/**
 * Verify user has access to an idea
 */
async function verifyIdeaAccess(ideaId: string, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT id FROM ideas
    WHERE id = ${ideaId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
  `
  return result.length > 0
}

/**
 * GET /api/ideas/[id]/validations
 * List all validation sessions for an idea
 *
 * Query params:
 * - status: "active" | "completed" | "paused" | "cancelled"
 * - agentType: "business" | "technical" | "product" | "custom"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Verify access
    if (!(await verifyIdeaAccess(id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const agentType = searchParams.get('agentType')

    const validations = await sql`
      SELECT v.*, f.name as current_facet_name, f.facet_type as current_facet_type
      FROM idea_validations v
      LEFT JOIN idea_facets f ON v.current_facet_id = f.id
      WHERE v.idea_id = ${id}
        ${status ? sql`AND v.status = ${status}` : sql``}
        ${agentType ? sql`AND v.agent_type = ${agentType}` : sql``}
      ORDER BY v.created_at DESC
    `

    const transformedValidations = validations.map(v => ({
      ...transformValidation(v),
      currentFacetName: v.current_facet_name,
      currentFacetType: v.current_facet_type
    }))

    // Get summary stats
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        AVG(validation_score) FILTER (WHERE validation_score IS NOT NULL) as avg_score
      FROM idea_validations
      WHERE idea_id = ${id}
    `

    return successResponse(transformedValidations, {
      total: transformedValidations.length,
      activeCount: parseInt(stats[0]?.active_count || '0'),
      completedCount: parseInt(stats[0]?.completed_count || '0'),
      averageScore: stats[0]?.avg_score ? Math.round(parseFloat(stats[0].avg_score)) : null
    })
  } catch (error: any) {
    console.error('[API] GET /api/ideas/[id]/validations error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get validations',
      500,
      error.message
    )
  }
}

/**
 * POST /api/ideas/[id]/validations
 * Start a new validation session
 *
 * Body: { agentType, agentConfig? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Verify access
    if (!(await verifyIdeaAccess(id, userId))) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const body = await request.json()
    const { agentType, agentConfig } = body

    // Validate agent type
    const validAgentTypes: ValidationAgentType[] = ['business', 'technical', 'product', 'custom']
    if (!agentType || !validAgentTypes.includes(agentType)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid agent type', 400)
    }

    // Check if there's already an active validation for this agent type
    const activeValidation = await sql`
      SELECT id FROM idea_validations
      WHERE idea_id = ${id}
        AND agent_type = ${agentType}
        AND status = 'active'
    `
    if (activeValidation.length > 0) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `There is already an active ${agentType} validation. Complete or cancel it first.`,
        400
      )
    }

    // Get the idea details for context
    const idea = await sql`
      SELECT title, description, category, tags FROM ideas WHERE id = ${id}
    `

    // Get facets for validation context
    const facets = await sql`
      SELECT id, facet_type, name, data FROM idea_facets WHERE idea_id = ${id}
    `

    // Create initial system message based on agent type
    const systemMessages: Record<ValidationAgentType, string> = {
      business: `You are a Business Validation Agent analyzing the idea "${idea[0]?.title}". Your role is to evaluate business viability, market potential, revenue models, and competitive positioning. Ask probing questions and provide actionable feedback.`,
      technical: `You are a Technical Validation Agent analyzing the idea "${idea[0]?.title}". Your role is to evaluate technical feasibility, architecture choices, scalability concerns, and implementation risks. Ask probing questions and provide actionable feedback.`,
      product: `You are a Product Validation Agent analyzing the idea "${idea[0]?.title}". Your role is to evaluate user experience, feature prioritization, product-market fit, and customer value proposition. Ask probing questions and provide actionable feedback.`,
      custom: agentConfig?.systemPrompt || `You are a Custom Validation Agent analyzing the idea "${idea[0]?.title}". Provide comprehensive analysis and feedback.`
    }

    const initialMessages = [
      {
        role: 'system',
        content: systemMessages[agentType as ValidationAgentType],
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: `I'll be validating your idea: "${idea[0]?.title}". ${idea[0]?.description ? `I see the description is: "${idea[0].description}". ` : ''}Let me start by reviewing the information you've gathered so far. ${facets.length > 0 ? `I see you have ${facets.length} facet(s) of analysis. I'll review each one and provide feedback. Let's begin!` : `I notice you haven't added any analysis facets yet. I recommend starting with a Pros/Cons analysis or Market Research to give me more context. Would you like to add some facets first, or shall I ask you questions to help build out the idea?`}`,
        timestamp: new Date().toISOString()
      }
    ]

    // Create the validation session
    const result = await sql`
      INSERT INTO idea_validations (
        idea_id,
        agent_type,
        status,
        messages,
        validated_facet_ids,
        blockers,
        recommendations,
        agent_config
      ) VALUES (
        ${id},
        ${agentType},
        'active',
        ${JSON.stringify(initialMessages)},
        '{}',
        '{}',
        '{}',
        ${agentConfig ? JSON.stringify(agentConfig) : '{}'}
      )
      RETURNING *
    `

    return successResponse(transformValidation(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/ideas/[id]/validations error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create validation session',
      500,
      error.message
    )
  }
}
