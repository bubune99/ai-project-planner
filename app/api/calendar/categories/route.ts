import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { CalendarCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

function transformCategory(row: any): CalendarCategory {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    isVisible: row.is_visible,
    isDefault: row.is_default,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * GET /api/calendar/categories
 * List all calendar categories for the user
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext

    const categories = await sql`
      SELECT * FROM calendar_categories
      WHERE user_id = ${userId}
      ORDER BY order_index ASC, name ASC
    `

    // If no categories exist, create defaults
    if (categories.length === 0) {
      const defaults = [
        { name: 'Personal', color: '#3b82f6', icon: 'user', isDefault: true },
        { name: 'Work', color: '#22c55e', icon: 'briefcase', isDefault: false },
        { name: 'Family', color: '#f97316', icon: 'users', isDefault: false },
        { name: 'Health', color: '#ef4444', icon: 'heart', isDefault: false }
      ]

      for (let i = 0; i < defaults.length; i++) {
        const d = defaults[i]
        await sql`
          INSERT INTO calendar_categories (user_id, name, color, icon, is_default, order_index)
          VALUES (${userId}, ${d.name}, ${d.color}, ${d.icon}, ${d.isDefault}, ${i})
        `
      }

      // Fetch the newly created categories
      const newCategories = await sql`
        SELECT * FROM calendar_categories
        WHERE user_id = ${userId}
        ORDER BY order_index ASC, name ASC
      `
      return successResponse(newCategories.map(transformCategory), { total: newCategories.length })
    }

    return successResponse(categories.map(transformCategory), { total: categories.length })
  } catch (error: any) {
    console.error('[API] GET /api/calendar/categories error:', error)
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to get calendar categories', 500, error.message)
  }
}

/**
 * POST /api/calendar/categories
 * Create a new calendar category
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { name, color, icon, isVisible, isDefault } = body

    if (!name?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Category name is required', 400)
    }

    // Get max order index
    const maxOrder = await sql`
      SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
      FROM calendar_categories
      WHERE user_id = ${userId}
    `

    const result = await sql`
      INSERT INTO calendar_categories (user_id, name, color, icon, is_visible, is_default, order_index)
      VALUES (
        ${userId},
        ${name.trim()},
        ${color || '#3b82f6'},
        ${icon || null},
        ${isVisible !== false},
        ${isDefault || false},
        ${maxOrder[0].next_order}
      )
      RETURNING *
    `

    return successResponse(transformCategory(result[0]), undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/calendar/categories error:', error)
    if (error.message?.includes('duplicate key')) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'A category with this name already exists', 400)
    }
    return errorResponse(ErrorCodes.DATABASE_ERROR, 'Failed to create calendar category', 500, error.message)
  }
}
