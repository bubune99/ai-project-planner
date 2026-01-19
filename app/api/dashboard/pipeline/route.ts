import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/pipeline
 * Get idea pipeline statistics for dashboard widget
 *
 * Returns ideas grouped by lifecycle stage with counts and recent items
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    // Get counts by lifecycle stage
    const stageCounts = await sql`
      SELECT
        lifecycle,
        COUNT(*) as count
      FROM ideas
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
      GROUP BY lifecycle
      ORDER BY
        CASE lifecycle
          WHEN 'seed' THEN 1
          WHEN 'exploring' THEN 2
          WHEN 'refined' THEN 3
          WHEN 'promoted' THEN 4
          WHEN 'archived' THEN 5
          ELSE 6
        END
    `

    // Get recent ideas per stage (top 3 each)
    const recentByStage = await sql`
      WITH ranked_ideas AS (
        SELECT
          id,
          title,
          lifecycle,
          category,
          updated_at,
          ROW_NUMBER() OVER (PARTITION BY lifecycle ORDER BY updated_at DESC) as rn
        FROM ideas
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND lifecycle != 'archived'
      )
      SELECT id, title, lifecycle, category, updated_at
      FROM ranked_ideas
      WHERE rn <= 3
      ORDER BY
        CASE lifecycle
          WHEN 'seed' THEN 1
          WHEN 'exploring' THEN 2
          WHEN 'refined' THEN 3
          WHEN 'promoted' THEN 4
          ELSE 5
        END,
        updated_at DESC
    `

    // Get ideas ready for promotion (refined with high validation scores)
    const readyForPromotion = await sql`
      SELECT
        i.id,
        i.title,
        i.category,
        (SELECT COUNT(*) FROM idea_validations v WHERE v.idea_id = i.id) as validation_count,
        i.updated_at
      FROM ideas i
      WHERE i.user_id = ${userId}
        AND i.deleted_at IS NULL
        AND i.lifecycle = 'refined'
        AND i.promoted_to_project_id IS NULL
      ORDER BY
        (SELECT COUNT(*) FROM idea_validations v WHERE v.idea_id = i.id) DESC,
        i.updated_at DESC
      LIMIT 5
    `

    // Get stale ideas (not updated in 30+ days, not archived/promoted)
    const staleIdeas = await sql`
      SELECT
        id,
        title,
        lifecycle,
        category,
        updated_at
      FROM ideas
      WHERE user_id = ${userId}
        AND deleted_at IS NULL
        AND lifecycle NOT IN ('archived', 'promoted')
        AND updated_at < NOW() - INTERVAL '30 days'
      ORDER BY updated_at ASC
      LIMIT 5
    `

    // Build pipeline structure
    const pipeline: Record<string, { count: number; ideas: any[] }> = {
      seed: { count: 0, ideas: [] },
      exploring: { count: 0, ideas: [] },
      refined: { count: 0, ideas: [] },
      promoted: { count: 0, ideas: [] },
      archived: { count: 0, ideas: [] }
    }

    // Fill in counts
    stageCounts.forEach(row => {
      if (pipeline[row.lifecycle]) {
        pipeline[row.lifecycle].count = parseInt(row.count)
      }
    })

    // Fill in recent ideas
    recentByStage.forEach(idea => {
      if (pipeline[idea.lifecycle]) {
        pipeline[idea.lifecycle].ideas.push({
          id: idea.id,
          title: idea.title,
          category: idea.category,
          updatedAt: idea.updated_at
        })
      }
    })

    const totalActive = pipeline.seed.count + pipeline.exploring.count + pipeline.refined.count

    return successResponse({
      pipeline,
      summary: {
        totalActive,
        totalPromoted: pipeline.promoted.count,
        totalArchived: pipeline.archived.count,
        readyForPromotionCount: readyForPromotion.length,
        staleCount: staleIdeas.length
      },
      readyForPromotion: readyForPromotion.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        validationCount: parseInt(i.validation_count || '0'),
        updatedAt: i.updated_at
      })),
      staleIdeas: staleIdeas.map(i => ({
        id: i.id,
        title: i.title,
        lifecycle: i.lifecycle,
        category: i.category,
        updatedAt: i.updated_at
      }))
    })
  } catch (error: any) {
    console.error('[API] GET /api/dashboard/pipeline error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get idea pipeline',
      500,
      error.message
    )
  }
}
