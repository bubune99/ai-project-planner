import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformImplementation(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    filePath: row.file_path,
    functionName: row.function_name,
    parsedStructure: row.parsed_structure || {},
    complexityMetrics: row.complexity_metrics || {},
    algorithmPatterns: row.algorithm_patterns || [],
    performanceCharacteristics: row.performance_characteristics || {},
    edgeCasesHandled: row.edge_cases_handled || [],
    testCoverage: row.test_coverage,
    optimizationOpportunities: row.optimization_opportunities || [],
    compressionLevel: row.compression_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/memory/how
 * List implementation records with optional filters
 *
 * Query params:
 * - projectId: UUID (filter by project)
 * - filePath: string (filter by file path)
 * - functionName: string (filter by function name)
 * - minComplexity: number (filter by min cyclomatic complexity)
 * - limit: number (default 50)
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

    const projectId = searchParams.get('projectId')
    const filePath = searchParams.get('filePath')
    const functionName = searchParams.get('functionName')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const implementations = await sql`
      SELECT * FROM mlp_how_implementations
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${filePath ? sql`AND file_path ILIKE ${'%' + filePath + '%'}` : sql``}
        ${functionName ? sql`AND function_name ILIKE ${'%' + functionName + '%'}` : sql``}
      ORDER BY file_path ASC, function_name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    const countResult = await sql`
      SELECT COUNT(*) as total FROM mlp_how_implementations
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${filePath ? sql`AND file_path ILIKE ${'%' + filePath + '%'}` : sql``}
        ${functionName ? sql`AND function_name ILIKE ${'%' + functionName + '%'}` : sql``}
    `

    return successResponse(implementations.map(transformImplementation), {
      total: parseInt(countResult[0]?.total || '0'),
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/how error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get implementations',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/how
 * Create an implementation record
 *
 * Body: {
 *   projectId: UUID (required)
 *   filePath: string (required)
 *   functionName?: string
 *   parsedStructure?: object (AST-like)
 *   complexityMetrics?: { cyclomaticComplexity?: number, linesOfCode?: number, dependencies?: number }
 *   algorithmPatterns?: string[]
 *   performanceCharacteristics?: object
 *   edgeCasesHandled?: string[]
 *   testCoverage?: number (0-100)
 *   optimizationOpportunities?: string[]
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
      filePath,
      functionName,
      parsedStructure,
      complexityMetrics,
      algorithmPatterns,
      performanceCharacteristics,
      edgeCasesHandled,
      testCoverage,
      optimizationOpportunities
    } = body

    // Validate required fields
    if (!projectId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Project ID is required', 400)
    }
    if (!filePath?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'File path is required', 400)
    }

    // Verify project access
    const hasAccess = await verifyProjectOwnership(projectId, userId)
    if (!hasAccess) {
      return errorResponse(ErrorCodes.FORBIDDEN, 'No access to this project', 403)
    }

    // Validate test coverage if provided
    if (testCoverage !== undefined && (testCoverage < 0 || testCoverage > 100)) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Test coverage must be between 0 and 100', 400)
    }

    const result = await sql`
      INSERT INTO mlp_how_implementations (
        user_id,
        project_id,
        file_path,
        function_name,
        parsed_structure,
        complexity_metrics,
        algorithm_patterns,
        performance_characteristics,
        edge_cases_handled,
        test_coverage,
        optimization_opportunities
      ) VALUES (
        ${userId},
        ${projectId},
        ${filePath.trim()},
        ${functionName?.trim() || null},
        ${parsedStructure ? JSON.stringify(parsedStructure) : '{}'},
        ${complexityMetrics ? JSON.stringify(complexityMetrics) : '{}'},
        ${algorithmPatterns || []},
        ${performanceCharacteristics ? JSON.stringify(performanceCharacteristics) : '{}'},
        ${edgeCasesHandled || []},
        ${testCoverage || null},
        ${optimizationOpportunities || []}
      )
      RETURNING *
    `

    return successResponse(transformImplementation(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/how error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create implementation',
      500,
      error.message
    )
  }
}
