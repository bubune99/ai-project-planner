import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'

export const dynamic = 'force-dynamic'

function transformCategory(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentId: row.parent_id,
    isIncome: row.is_income,
    icon: row.icon,
    color: row.color,
    isSystem: row.is_system,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/finance/categories
 * List all categories (system + user custom)
 *
 * Query params:
 * - type: "income" | "expense"
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type')

    // Get system categories and user's custom categories
    const categories = await sql`
      SELECT * FROM finance_categories
      WHERE (user_id IS NULL OR user_id = ${userId})
        ${type === 'income' ? sql`AND is_income = true` : sql``}
        ${type === 'expense' ? sql`AND is_income = false` : sql``}
      ORDER BY is_system DESC, order_index ASC, name ASC
    `

    // Organize into tree structure
    const categoryMap = new Map()
    const rootCategories: any[] = []

    categories.forEach(cat => {
      const transformed = transformCategory(cat)
      categoryMap.set(cat.id, { ...transformed, subcategories: [] })
    })

    categories.forEach(cat => {
      const transformed = categoryMap.get(cat.id)
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id).subcategories.push(transformed)
      } else {
        rootCategories.push(transformed)
      }
    })

    return successResponse(rootCategories, {
      total: categories.length
    })
  } catch (error: any) {
    console.error('[API] GET /api/finance/categories error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get categories', 500, error.message)
  }
}

/**
 * POST /api/finance/categories
 * Create a custom category
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { name, parentId, isIncome, icon, color, orderIndex } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Category name is required', 400)
    }

    // If parentId provided, verify it exists and user has access
    if (parentId) {
      const parent = await sql`
        SELECT id FROM finance_categories
        WHERE id = ${parentId} AND (user_id IS NULL OR user_id = ${userId})
      `
      if (parent.length === 0) {
        return errorResponse(ErrorCodes.NOT_FOUND, 'Parent category not found', 404)
      }
    }

    const result = await sql`
      INSERT INTO finance_categories (
        user_id, name, parent_id, is_income, icon, color, is_system, order_index
      ) VALUES (
        ${userId},
        ${name.trim()},
        ${parentId || null},
        ${isIncome || false},
        ${icon || null},
        ${color || null},
        false,
        ${orderIndex || 0}
      )
      RETURNING *
    `

    return successResponse(transformCategory(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/finance/categories error:', error)
    if (error.code === '23505') { // unique_violation
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Category with this name already exists', 400)
    }
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create category', 500, error.message)
  }
}
