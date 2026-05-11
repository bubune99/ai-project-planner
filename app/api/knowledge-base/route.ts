import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = "force-dynamic"

/**
 * GET /api/knowledge-base
 * Search or list documents
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    const category = searchParams.get('category')

    let documents
    if (query) {
      // Simple text search for now
      documents = await sql`
        SELECT *
        FROM documents
        WHERE
          (title ILIKE ${'%' + query + '%'} OR description ILIKE ${'%' + query + '%'})
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `
    } else if (category) {
      documents = await sql`
        SELECT *
        FROM documents
        WHERE category = ${category} AND deleted_at IS NULL
        ORDER BY title ASC
      `
    } else {
      documents = await sql`
        SELECT *
        FROM documents
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 50
      `
    }

    return successResponse(documents, {
      total: documents.length
    })
  } catch (error: any) {
    console.error('[GET /api/knowledge-base] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get documents',
      500,
      error.message
    )
  }
}

/**
 * POST /api/knowledge-base
 * Create a new document
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const body = await request.json()
    // Extract project_id (snake_case) as expected from SDK
    const { title, description, category, content, project_id } = body

    if (!title || !category) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'title and category are required',
        400
      )
    }

    const result = await sql`
      INSERT INTO documents (
        project_id,
        title,
        description,
        category,
        file_type,
        file_size,
        blob_key,
        metadata
      ) VALUES (
        ${project_id || null}, -- Global docs might not have project_id
        ${title},
        ${description || 'No description'},
        ${category},
        'markdown',
        0,
        'db-stored', -- Placeholder for blob key
        ${JSON.stringify({ content: content || '' })}
      )
      RETURNING *
    `

    return successResponse(result[0], undefined, 201)
  } catch (error: any) {
    console.error('[POST /api/knowledge-base] Error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to create document',
      500,
      error.message
    )
  }
}
