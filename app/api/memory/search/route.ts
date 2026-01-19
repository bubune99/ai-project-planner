import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/memory/search
 * Search across all memory layers (5W+H)
 *
 * Query params:
 * - q: string (required) - search query
 * - layers: string (comma-separated) - which layers to search: where,what,how,why,who,when
 * - projectId: UUID (filter by project)
 * - ideaId: UUID (filter by idea)
 * - limit: number (default 20 per layer)
 * - offset: number (pagination)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const query = searchParams.get('q')
    if (!query?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Search query (q) is required', 400)
    }

    const layersParam = searchParams.get('layers')
    const layers = layersParam
      ? layersParam.split(',').map(l => l.trim().toLowerCase())
      : ['where', 'what', 'how', 'why', 'who', 'when']

    const projectId = searchParams.get('projectId')
    const ideaId = searchParams.get('ideaId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = parseInt(searchParams.get('offset') || '0')

    const searchPattern = `%${query}%`
    const results: Record<string, any[]> = {}
    const counts: Record<string, number> = {}

    // Search WHERE layer - project structures
    if (layers.includes('where')) {
      const whereResults = await sql`
        SELECT
          id,
          project_id,
          'where' as layer,
          folder_structure,
          architecture_patterns,
          key_endpoints,
          semantic_zones,
          entry_points,
          abstraction_layers,
          updated_at
        FROM mlp_where_structures
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            architecture_patterns::text ILIKE ${searchPattern}
            OR key_endpoints::text ILIKE ${searchPattern}
            OR entry_points::text ILIKE ${searchPattern}
            OR abstraction_layers::text ILIKE ${searchPattern}
          )
        ORDER BY updated_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      results.where = whereResults.map(row => ({
        id: row.id,
        projectId: row.project_id,
        layer: 'where',
        highlights: {
          architecturePatterns: row.architecture_patterns || [],
          keyEndpoints: row.key_endpoints || [],
          entryPoints: row.entry_points || [],
          abstractionLayers: row.abstraction_layers || []
        },
        updatedAt: row.updated_at
      }))

      const whereCount = await sql`
        SELECT COUNT(*) as count FROM mlp_where_structures
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            architecture_patterns::text ILIKE ${searchPattern}
            OR key_endpoints::text ILIKE ${searchPattern}
            OR entry_points::text ILIKE ${searchPattern}
            OR abstraction_layers::text ILIKE ${searchPattern}
          )
      `
      counts.where = parseInt(whereCount[0]?.count || '0')
    }

    // Search WHAT layer - module relationships
    if (layers.includes('what')) {
      const whatResults = await sql`
        SELECT
          id,
          project_id,
          'what' as layer,
          file_path,
          module_name,
          imports,
          exports,
          classes,
          functions,
          types,
          module_responsibility,
          updated_at
        FROM mlp_what_modules
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            file_path ILIKE ${searchPattern}
            OR module_name ILIKE ${searchPattern}
            OR imports::text ILIKE ${searchPattern}
            OR exports::text ILIKE ${searchPattern}
            OR classes::text ILIKE ${searchPattern}
            OR functions::text ILIKE ${searchPattern}
            OR types::text ILIKE ${searchPattern}
            OR module_responsibility ILIKE ${searchPattern}
          )
        ORDER BY updated_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      results.what = whatResults.map(row => ({
        id: row.id,
        projectId: row.project_id,
        layer: 'what',
        filePath: row.file_path,
        moduleName: row.module_name,
        highlights: {
          imports: row.imports || [],
          exports: row.exports || [],
          classes: row.classes || [],
          functions: row.functions || [],
          types: row.types || [],
          moduleResponsibility: row.module_responsibility
        },
        updatedAt: row.updated_at
      }))

      const whatCount = await sql`
        SELECT COUNT(*) as count FROM mlp_what_modules
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            file_path ILIKE ${searchPattern}
            OR module_name ILIKE ${searchPattern}
            OR imports::text ILIKE ${searchPattern}
            OR exports::text ILIKE ${searchPattern}
            OR classes::text ILIKE ${searchPattern}
            OR functions::text ILIKE ${searchPattern}
            OR types::text ILIKE ${searchPattern}
            OR module_responsibility ILIKE ${searchPattern}
          )
      `
      counts.what = parseInt(whatCount[0]?.count || '0')
    }

    // Search HOW layer - implementation details
    if (layers.includes('how')) {
      const howResults = await sql`
        SELECT
          id,
          project_id,
          'how' as layer,
          file_path,
          function_name,
          algorithm_patterns,
          edge_cases_handled,
          optimization_opportunities,
          updated_at
        FROM mlp_how_implementations
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            file_path ILIKE ${searchPattern}
            OR function_name ILIKE ${searchPattern}
            OR algorithm_patterns::text ILIKE ${searchPattern}
            OR edge_cases_handled::text ILIKE ${searchPattern}
            OR optimization_opportunities::text ILIKE ${searchPattern}
          )
        ORDER BY updated_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      results.how = howResults.map(row => ({
        id: row.id,
        projectId: row.project_id,
        layer: 'how',
        filePath: row.file_path,
        functionName: row.function_name,
        highlights: {
          algorithmPatterns: row.algorithm_patterns || [],
          edgeCasesHandled: row.edge_cases_handled || [],
          optimizationOpportunities: row.optimization_opportunities || []
        },
        updatedAt: row.updated_at
      }))

      const howCount = await sql`
        SELECT COUNT(*) as count FROM mlp_how_implementations
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          AND (
            file_path ILIKE ${searchPattern}
            OR function_name ILIKE ${searchPattern}
            OR algorithm_patterns::text ILIKE ${searchPattern}
            OR edge_cases_handled::text ILIKE ${searchPattern}
            OR optimization_opportunities::text ILIKE ${searchPattern}
          )
      `
      counts.how = parseInt(howCount[0]?.count || '0')
    }

    // Search WHY layer - decisions
    if (layers.includes('why')) {
      const whyResults = await sql`
        SELECT
          id,
          project_id,
          idea_id,
          'why' as layer,
          title,
          summary,
          status,
          domains,
          tags,
          stakeholders,
          business_drivers,
          technical_constraints,
          updated_at
        FROM mlp_why_decisions
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            title ILIKE ${searchPattern}
            OR summary ILIKE ${searchPattern}
            OR domains::text ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
            OR stakeholders::text ILIKE ${searchPattern}
            OR business_drivers::text ILIKE ${searchPattern}
            OR technical_constraints::text ILIKE ${searchPattern}
          )
        ORDER BY updated_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      results.why = whyResults.map(row => ({
        id: row.id,
        projectId: row.project_id,
        ideaId: row.idea_id,
        layer: 'why',
        title: row.title,
        summary: row.summary,
        status: row.status,
        highlights: {
          domains: row.domains || [],
          tags: row.tags || [],
          stakeholders: row.stakeholders || [],
          businessDrivers: row.business_drivers || [],
          technicalConstraints: row.technical_constraints || []
        },
        updatedAt: row.updated_at
      }))

      const whyCount = await sql`
        SELECT COUNT(*) as count FROM mlp_why_decisions
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            title ILIKE ${searchPattern}
            OR summary ILIKE ${searchPattern}
            OR domains::text ILIKE ${searchPattern}
            OR tags::text ILIKE ${searchPattern}
            OR stakeholders::text ILIKE ${searchPattern}
            OR business_drivers::text ILIKE ${searchPattern}
            OR technical_constraints::text ILIKE ${searchPattern}
          )
      `
      counts.why = parseInt(whyCount[0]?.count || '0')
    }

    // Search WHO layer - collaborators
    if (layers.includes('who')) {
      const whoResults = await sql`
        SELECT
          id,
          'who' as layer,
          name,
          collaborator_type,
          expertise,
          notes,
          updated_at
        FROM mlp_who_collaborators
        WHERE user_id = ${userId}
          AND (
            name ILIKE ${searchPattern}
            OR expertise::text ILIKE ${searchPattern}
            OR notes ILIKE ${searchPattern}
          )
        ORDER BY updated_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
      results.who = whoResults.map(row => ({
        id: row.id,
        layer: 'who',
        name: row.name,
        collaboratorType: row.collaborator_type,
        highlights: {
          expertise: row.expertise || [],
          notes: row.notes
        },
        updatedAt: row.updated_at
      }))

      const whoCount = await sql`
        SELECT COUNT(*) as count FROM mlp_who_collaborators
        WHERE user_id = ${userId}
          AND (
            name ILIKE ${searchPattern}
            OR expertise::text ILIKE ${searchPattern}
            OR notes ILIKE ${searchPattern}
          )
      `
      counts.who = parseInt(whoCount[0]?.count || '0')
    }

    // Search WHEN layer - events and milestones
    if (layers.includes('when')) {
      // Search events
      const eventResults = await sql`
        SELECT
          id,
          project_id,
          idea_id,
          'when_event' as layer,
          event_type,
          description,
          affected_components,
          timestamp
        FROM mlp_when_events
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            event_type ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR affected_components::text ILIKE ${searchPattern}
          )
        ORDER BY timestamp DESC
        LIMIT ${Math.floor(limit / 2)}
        OFFSET ${offset}
      `

      // Search milestones
      const milestoneResults = await sql`
        SELECT
          id,
          project_id,
          idea_id,
          'when_milestone' as layer,
          title,
          description,
          milestone_type,
          status,
          target_date,
          achieved_date,
          impact,
          updated_at
        FROM mlp_when_milestones
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            title ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR milestone_type ILIKE ${searchPattern}
            OR impact ILIKE ${searchPattern}
          )
        ORDER BY COALESCE(target_date, achieved_date, updated_at) DESC
        LIMIT ${Math.floor(limit / 2)}
        OFFSET ${offset}
      `

      results.when = [
        ...eventResults.map(row => ({
          id: row.id,
          projectId: row.project_id,
          ideaId: row.idea_id,
          layer: 'when',
          type: 'event',
          eventType: row.event_type,
          description: row.description,
          highlights: {
            affectedComponents: row.affected_components || []
          },
          timestamp: row.timestamp
        })),
        ...milestoneResults.map(row => ({
          id: row.id,
          projectId: row.project_id,
          ideaId: row.idea_id,
          layer: 'when',
          type: 'milestone',
          title: row.title,
          description: row.description,
          milestoneType: row.milestone_type,
          status: row.status,
          highlights: {
            impact: row.impact
          },
          targetDate: row.target_date,
          achievedDate: row.achieved_date
        }))
      ]

      const eventCount = await sql`
        SELECT COUNT(*) as count FROM mlp_when_events
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            event_type ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR affected_components::text ILIKE ${searchPattern}
          )
      `
      const milestoneCount = await sql`
        SELECT COUNT(*) as count FROM mlp_when_milestones
        WHERE user_id = ${userId}
          ${projectId ? sql`AND project_id = ${projectId}` : sql``}
          ${ideaId ? sql`AND idea_id = ${ideaId}` : sql``}
          AND (
            title ILIKE ${searchPattern}
            OR description ILIKE ${searchPattern}
            OR milestone_type ILIKE ${searchPattern}
            OR impact ILIKE ${searchPattern}
          )
      `
      counts.when = parseInt(eventCount[0]?.count || '0') + parseInt(milestoneCount[0]?.count || '0')
    }

    // Calculate total matches across all layers
    const totalMatches = Object.values(counts).reduce((sum, count) => sum + count, 0)

    return successResponse({
      query,
      results,
      counts,
      totalMatches,
      searchedLayers: layers
    }, {
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/search error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to search memory',
      500,
      error.message
    )
  }
}
