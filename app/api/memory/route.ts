import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/memory
 * Get overview of all memory layers for the authenticated user
 *
 * Query params:
 * - projectId: UUID (filter by project)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // Get counts for each layer
    const whereCounts = await sql`
      SELECT COUNT(*) as count FROM mlp_where_structures
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    const whatCounts = await sql`
      SELECT COUNT(*) as count FROM mlp_what_modules
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    const howCounts = await sql`
      SELECT COUNT(*) as count FROM mlp_how_implementations
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    const whyDecisionsCounts = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'revisit') as revisit
      FROM mlp_why_decisions
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    const whoCounts = await sql`
      SELECT COUNT(*) as count FROM mlp_who_collaborators
      WHERE user_id = ${userId}
    `

    const whenEventsCounts = await sql`
      SELECT COUNT(*) as count FROM mlp_when_events
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    const whenMilestonesCounts = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'achieved') as achieved
      FROM mlp_when_milestones
      WHERE user_id = ${userId}
      ${projectId ? sql`AND project_id = ${projectId}` : sql``}
    `

    // Get compression settings
    const settings = await sql`
      SELECT * FROM mlp_compression_settings
      WHERE user_id = ${userId}
    `

    const overview = {
      where: {
        structures: parseInt(whereCounts[0]?.count || '0'),
        description: 'Project structure, navigation, and semantic zones'
      },
      what: {
        modules: parseInt(whatCounts[0]?.count || '0'),
        description: 'Module relationships, dependencies, and interfaces'
      },
      how: {
        implementations: parseInt(howCounts[0]?.count || '0'),
        description: 'Implementation details, algorithms, and complexity'
      },
      why: {
        decisions: {
          total: parseInt(whyDecisionsCounts[0]?.total || '0'),
          active: parseInt(whyDecisionsCounts[0]?.active || '0'),
          resolved: parseInt(whyDecisionsCounts[0]?.resolved || '0'),
          revisit: parseInt(whyDecisionsCounts[0]?.revisit || '0')
        },
        description: 'Decision episodes, reasoning, and lessons learned'
      },
      who: {
        collaborators: parseInt(whoCounts[0]?.count || '0'),
        description: 'People and AI agents involved'
      },
      when: {
        events: parseInt(whenEventsCounts[0]?.count || '0'),
        milestones: {
          total: parseInt(whenMilestonesCounts[0]?.total || '0'),
          pending: parseInt(whenMilestonesCounts[0]?.pending || '0'),
          achieved: parseInt(whenMilestonesCounts[0]?.achieved || '0')
        },
        description: 'Temporal events, evolution, and milestones'
      },
      settings: settings[0] || null
    }

    return successResponse(overview)
  } catch (error: any) {
    console.error('[API] GET /api/memory error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get memory overview',
      500,
      error.message
    )
  }
}
