import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext, verifyProjectOwnership } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * Transform database row to frontend format
 */
function transformModule(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    filePath: row.file_path,
    moduleName: row.module_name,
    imports: row.imports || [],
    exports: row.exports || [],
    classes: row.classes || [],
    functions: row.functions || [],
    types: row.types || [],
    dependencies: row.dependencies || [],
    interfaceContracts: row.interface_contracts || {},
    moduleResponsibility: row.module_responsibility,
    publicApi: row.public_api || [],
    changeStability: row.change_stability,
    compressionLevel: row.compression_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/memory/what
 * List module records with optional filters
 *
 * Query params:
 * - projectId: UUID (filter by project)
 * - filePath: string (filter by file path pattern)
 * - stability: "stable" | "evolving" | "experimental"
 * - search: string (search in file path or module name)
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
    const stability = searchParams.get('stability')
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const modules = await sql`
      SELECT * FROM mlp_what_modules
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${filePath ? sql`AND file_path ILIKE ${'%' + filePath + '%'}` : sql``}
        ${stability ? sql`AND change_stability = ${stability}` : sql``}
        ${search ? sql`AND (file_path ILIKE ${'%' + search + '%'} OR module_name ILIKE ${'%' + search + '%'})` : sql``}
      ORDER BY file_path ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    const countResult = await sql`
      SELECT COUNT(*) as total FROM mlp_what_modules
      WHERE user_id = ${userId}
        ${projectId ? sql`AND project_id = ${projectId}` : sql``}
        ${filePath ? sql`AND file_path ILIKE ${'%' + filePath + '%'}` : sql``}
        ${stability ? sql`AND change_stability = ${stability}` : sql``}
        ${search ? sql`AND (file_path ILIKE ${'%' + search + '%'} OR module_name ILIKE ${'%' + search + '%'})` : sql``}
    `

    return successResponse(modules.map(transformModule), {
      total: parseInt(countResult[0]?.total || '0'),
      limit,
      offset
    })
  } catch (error: any) {
    console.error('[API] GET /api/memory/what error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get modules',
      500,
      error.message
    )
  }
}

/**
 * POST /api/memory/what
 * Create or update a module record
 *
 * Body: {
 *   projectId: UUID (required)
 *   filePath: string (required)
 *   moduleName?: string
 *   imports?: string[]
 *   exports?: string[]
 *   classes?: string[]
 *   functions?: string[]
 *   types?: string[]
 *   dependencies?: string[]
 *   interfaceContracts?: object
 *   moduleResponsibility?: string
 *   publicApi?: string[]
 *   changeStability?: "stable" | "evolving" | "experimental"
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
      moduleName,
      imports,
      exports,
      classes,
      functions,
      types,
      dependencies,
      interfaceContracts,
      moduleResponsibility,
      publicApi,
      changeStability
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

    // Validate stability if provided
    const validStability = ['stable', 'evolving', 'experimental']
    if (changeStability && !validStability.includes(changeStability)) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid stability. Must be one of: ${validStability.join(', ')}`,
        400
      )
    }

    // Upsert - unique on project_id + file_path
    const result = await sql`
      INSERT INTO mlp_what_modules (
        user_id,
        project_id,
        file_path,
        module_name,
        imports,
        exports,
        classes,
        functions,
        types,
        dependencies,
        interface_contracts,
        module_responsibility,
        public_api,
        change_stability
      ) VALUES (
        ${userId},
        ${projectId},
        ${filePath.trim()},
        ${moduleName?.trim() || null},
        ${imports || []},
        ${exports || []},
        ${classes || []},
        ${functions || []},
        ${types || []},
        ${dependencies || []},
        ${interfaceContracts ? JSON.stringify(interfaceContracts) : '{}'},
        ${moduleResponsibility?.trim() || null},
        ${publicApi || []},
        ${changeStability || 'evolving'}
      )
      ON CONFLICT (project_id, file_path)
      DO UPDATE SET
        module_name = COALESCE(EXCLUDED.module_name, mlp_what_modules.module_name),
        imports = COALESCE(EXCLUDED.imports, mlp_what_modules.imports),
        exports = COALESCE(EXCLUDED.exports, mlp_what_modules.exports),
        classes = COALESCE(EXCLUDED.classes, mlp_what_modules.classes),
        functions = COALESCE(EXCLUDED.functions, mlp_what_modules.functions),
        types = COALESCE(EXCLUDED.types, mlp_what_modules.types),
        dependencies = COALESCE(EXCLUDED.dependencies, mlp_what_modules.dependencies),
        interface_contracts = COALESCE(EXCLUDED.interface_contracts, mlp_what_modules.interface_contracts),
        module_responsibility = COALESCE(EXCLUDED.module_responsibility, mlp_what_modules.module_responsibility),
        public_api = COALESCE(EXCLUDED.public_api, mlp_what_modules.public_api),
        change_stability = COALESCE(EXCLUDED.change_stability, mlp_what_modules.change_stability),
        updated_at = NOW()
      RETURNING *
    `

    return successResponse(transformModule(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/memory/what error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create/update module',
      500,
      error.message
    )
  }
}
