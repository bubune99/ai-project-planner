import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

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
 * POST /api/ideas/[id]/promote
 * Promote an idea to a project
 *
 * Body: {
 *   projectName?: string (defaults to idea title),
 *   projectDescription?: string (defaults to idea description),
 *   includeSteps?: boolean (create project steps from idea facets),
 *   phase?: string (initial project phase)
 * }
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

    // Get the idea
    const ideaResult = await sql`
      SELECT * FROM ideas
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `
    if (ideaResult.length === 0) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Idea not found', 404)
    }

    const idea = ideaResult[0]

    // Check if already promoted
    if (idea.promoted_to_project_id) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'This idea has already been promoted to a project',
        400
      )
    }

    // Check if idea is in a valid state for promotion (should be at least 'refined')
    if (idea.lifecycle === 'seed') {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Ideas in "seed" state cannot be promoted. Add some analysis facets first.',
        400
      )
    }

    const body = await request.json()
    const { projectName, projectDescription, includeSteps, phase } = body

    // Create the project
    const projectResult = await sql`
      INSERT INTO projects (
        owner_id,
        name,
        description,
        status,
        current_phase,
        metadata
      ) VALUES (
        ${userId},
        ${projectName || idea.title},
        ${projectDescription || idea.description || null},
        'planning',
        ${phase || 'planning'},
        ${JSON.stringify({
          promotedFromIdea: id,
          promotedAt: new Date().toISOString(),
          ideaCategory: idea.category,
          ideaTags: idea.tags
        })}
      )
      RETURNING *
    `

    const project = projectResult[0]

    // Optionally create project steps from facets
    if (includeSteps !== false) {
      // Get idea facets
      const facets = await sql`
        SELECT * FROM idea_facets
        WHERE idea_id = ${id}
        ORDER BY order_index ASC
      `

      // Create steps from facets
      let stepIndex = 0
      for (const facet of facets) {
        // Map facet types to meaningful step names
        const stepNames: Record<string, string> = {
          'pros_cons': 'Review pros and cons analysis',
          'timeline': 'Create project timeline',
          'market_research': 'Complete market research',
          'technical_specs': 'Define technical specifications',
          'financials': 'Finalize financial projections',
          'dependencies': 'Identify and plan for dependencies',
          'risks': 'Develop risk mitigation strategy',
          'alternatives': 'Evaluate alternative approaches',
          'custom': facet.name || 'Complete custom analysis'
        }

        await sql`
          INSERT INTO project_steps (
            project_id,
            title,
            description,
            status,
            order_index,
            metadata
          ) VALUES (
            ${project.id},
            ${stepNames[facet.facet_type] || facet.name || `Analyze ${facet.facet_type}`},
            ${`Based on ${facet.facet_type} analysis from idea incubation`},
            'pending',
            ${stepIndex},
            ${JSON.stringify({
              fromFacet: facet.id,
              facetType: facet.facet_type,
              facetData: facet.data
            })}
          )
        `
        stepIndex++
      }

      // Get validations and add recommendations as steps
      const validations = await sql`
        SELECT recommendations FROM idea_validations
        WHERE idea_id = ${id} AND status = 'completed'
      `

      for (const validation of validations) {
        if (validation.recommendations?.length > 0) {
          for (const recommendation of validation.recommendations) {
            await sql`
              INSERT INTO project_steps (
                project_id,
                title,
                description,
                status,
                order_index,
                metadata
              ) VALUES (
                ${project.id},
                ${recommendation.length > 100 ? recommendation.substring(0, 97) + '...' : recommendation},
                ${'Recommendation from idea validation'},
                'pending',
                ${stepIndex},
                ${JSON.stringify({ fromValidation: true })}
              )
            `
            stepIndex++
          }
        }
      }
    }

    // Update the idea to link to project
    await sql`
      UPDATE ideas
      SET
        lifecycle = 'promoted',
        promoted_to_project_id = ${project.id},
        promoted_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
    `

    // Get step count for response
    const stepCount = await sql`
      SELECT COUNT(*) as count FROM project_steps WHERE project_id = ${project.id}
    `

    return successResponse({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        currentPhase: project.current_phase,
        createdAt: project.created_at
      },
      idea: {
        id: idea.id,
        title: idea.title,
        lifecycle: 'promoted'
      },
      stepsCreated: parseInt(stepCount[0]?.count || '0'),
      message: `Idea "${idea.title}" has been successfully promoted to project "${project.name}"`
    }, undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/ideas/[id]/promote error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to promote idea to project',
      500,
      error.message
    )
  }
}
