import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

interface Subtask {
  id: string
  title: string
  completed: boolean
  completedAt?: string
  createdAt: string
}

/**
 * Verify user owns a todo and get its metadata
 */
async function getTodoWithMetadata(todoId: string, userId: string) {
  const result = await sql`
    SELECT id, metadata FROM todos
    WHERE id = ${todoId} AND user_id = ${userId} AND deleted_at IS NULL
  `
  return result[0] || null
}

/**
 * GET /api/todos/[id]/subtasks
 * Get all subtasks for a todo
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const todo = await getTodoWithMetadata(id, userId)

    if (!todo) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const subtasks: Subtask[] = todo.metadata?.subtasks || []
    const completed = subtasks.filter(s => s.completed).length
    const total = subtasks.length

    return successResponse(subtasks, {
      total,
      completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0
    })
  } catch (error: any) {
    console.error('[API] GET /api/todos/[id]/subtasks error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to get subtasks',
      500,
      error.message
    )
  }
}

/**
 * POST /api/todos/[id]/subtasks
 * Add a new subtask
 *
 * Body: { title: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { title } = body

    if (!title?.trim()) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'Title is required', 400)
    }

    const todo = await getTodoWithMetadata(id, userId)
    if (!todo) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const metadata = todo.metadata || {}
    const subtasks: Subtask[] = metadata.subtasks || []

    const newSubtask: Subtask = {
      id: uuidv4(),
      title: title.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    }

    subtasks.push(newSubtask)
    metadata.subtasks = subtasks

    await sql`
      UPDATE todos
      SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `

    return successResponse(newSubtask, undefined, 201)
  } catch (error: any) {
    console.error('[API] POST /api/todos/[id]/subtasks error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to add subtask',
      500,
      error.message
    )
  }
}

/**
 * PATCH /api/todos/[id]/subtasks
 * Update a subtask (toggle completion or update title)
 *
 * Body: { subtaskId: string, title?: string, completed?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { subtaskId, title, completed } = body

    if (!subtaskId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'subtaskId is required', 400)
    }

    const todo = await getTodoWithMetadata(id, userId)
    if (!todo) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const metadata = todo.metadata || {}
    const subtasks: Subtask[] = metadata.subtasks || []

    const subtaskIndex = subtasks.findIndex(s => s.id === subtaskId)
    if (subtaskIndex === -1) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Subtask not found', 404)
    }

    // Update subtask
    if (title !== undefined) {
      subtasks[subtaskIndex].title = title.trim()
    }
    if (completed !== undefined) {
      subtasks[subtaskIndex].completed = completed
      subtasks[subtaskIndex].completedAt = completed ? new Date().toISOString() : undefined
    }

    metadata.subtasks = subtasks

    await sql`
      UPDATE todos
      SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `

    return successResponse(subtasks[subtaskIndex])
  } catch (error: any) {
    console.error('[API] PATCH /api/todos/[id]/subtasks error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to update subtask',
      500,
      error.message
    )
  }
}

/**
 * DELETE /api/todos/[id]/subtasks
 * Delete a subtask
 *
 * Body: { subtaskId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }

    const { userId } = authContext
    const body = await request.json()
    const { subtaskId } = body

    if (!subtaskId) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, 'subtaskId is required', 400)
    }

    const todo = await getTodoWithMetadata(id, userId)
    if (!todo) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Todo not found', 404)
    }

    const metadata = todo.metadata || {}
    const subtasks: Subtask[] = metadata.subtasks || []

    const subtaskIndex = subtasks.findIndex(s => s.id === subtaskId)
    if (subtaskIndex === -1) {
      return errorResponse(ErrorCodes.NOT_FOUND, 'Subtask not found', 404)
    }

    subtasks.splice(subtaskIndex, 1)
    metadata.subtasks = subtasks

    await sql`
      UPDATE todos
      SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `

    return successResponse({ deleted: true, subtaskId })
  } catch (error: any) {
    console.error('[API] DELETE /api/todos/[id]/subtasks error:', error)
    return errorResponse(
      ErrorCodes.DATABASE_ERROR,
      'Failed to delete subtask',
      500,
      error.message
    )
  }
}
