import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformStructure(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    folderStructure: row.folder_structure || {},
    architecturePatterns: row.architecture_patterns || [],
    keyEndpoints: row.key_endpoints || [],
    styleConventions: row.style_conventions || {},
    configLocations: row.config_locations || {},
    semanticZones: row.semantic_zones || [],
    dependencyGraph: row.dependency_graph || {},
    entryPoints: row.entry_points || [],
    abstractionLayers: row.abstraction_layers || [],
    compressionLevel: row.compression_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/memory/where
 * List project structures with optional filters
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

    const structures = await sql`
      SELECT * FROM mlp_where_structures
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
      ORDER BY updated_at DESC
    `

    return successResponse(structures.map(transformStructure), {
      total: structures.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/where error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get structures',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/where
 * Create or update project structure record
 *
 * Body: {
 *   projectId: UUID (required)
 *   folderStructure?: object
 *   architecturePatterns?: string[]
 *   keyEndpoints?: string[]
 *   styleConventions?: object
 *   configLocations?: object
 *   semanticZones?: Array<{zone: string, paths: string[], purpose: string}>
 *   dependencyGraph?: object
 *   entryPoints?: string[]
 *   abstractionLayers?: string[]
 * }
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
      projectId,
      folderStructure,
      architecturePatterns,
      keyEndpoints,
      styleConventions,
      configLocations,
      semanticZones,
      dependencyGraph,
      entryPoints,
      abstractionLayers
    } = body

    // Validate required fields
    if (!projectId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Project ID is required', 400)
    }

    // Verify project access
    const hasAccess = await verifyProjectOwnership(projectId, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.FORBIDDEN, 'No access to this project', 403)
    }

    // Upsert - one structure record per project
    const result = await sql`
      INSERT INTO mlp_where_structures (
        user_id,
        project_id,
        folder_structure,
        architecture_patterns,
        key_endpoints,
        style_conventions,
        config_locations,
        semantic_zones,
        dependency_graph,
        entry_points,
        abstraction_layers
      ) VALUES (
        ${userId},
        ${projectId},
        ${folderStructure ? JSON.stringify(folderStructure) : '{}'},
        ${architecturePatterns || []},
        ${keyEndpoints || []},
        ${styleConventions ? JSON.stringify(styleConventions) : '{}'},
        ${configLocations ? JSON.stringify(configLocations) : '{}'},
        ${semanticZones ? JSON.stringify(semanticZones) : '[]'},
        ${dependencyGraph ? JSON.stringify(dependencyGraph) : '{}'},
        ${entryPoints || []},
        ${abstractionLayers || []}
      )
      ON CONFLICT (project_id) WHERE project_id IS NOT NULL
      DO UPDATE SET
        folder_structure = COALESCE(EXCLUDED.folder_structure, mlp_where_structures.folder_structure),
        architecture_patterns = COALESCE(EXCLUDED.architecture_patterns, mlp_where_structures.architecture_patterns),
        key_endpoints = COALESCE(EXCLUDED.key_endpoints, mlp_where_structures.key_endpoints),
        style_conventions = COALESCE(EXCLUDED.style_conventions, mlp_where_structures.style_conventions),
        config_locations = COALESCE(EXCLUDED.config_locations, mlp_where_structures.config_locations),
        semantic_zones = COALESCE(EXCLUDED.semantic_zones, mlp_where_structures.semantic_zones),
        dependency_graph = COALESCE(EXCLUDED.dependency_graph, mlp_where_structures.dependency_graph),
        entry_points = COALESCE(EXCLUDED.entry_points, mlp_where_structures.entry_points),
        abstraction_layers = COALESCE(EXCLUDED.abstraction_layers, mlp_where_structures.abstraction_layers),
        updated_at = NOW()
      RETURNING *
    `

    return successResponse(transformStructure(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/where error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create/update structure',
      500,
      error.message
    )
  }
}
