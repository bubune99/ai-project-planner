import { sql } from '@/lib/db/client'
import { NextRequest } from 'next/server'
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-utils'
import { getAuthContext } from '@/lib/auth/auth-utils'
import type { WorkItem } from '@/lib/work-items'

/**
 * GET /api/work?view=open|done
 *
 * "My Work": every open project step across the caller's projects, plus every
 * todo that is NOT a mirror of a step.
 *
 * Migration 057 copied project-linked todos into project_steps and set
 * todos.step_id, intending the todo to become a pointer. Nothing enforced that,
 * so /todos rendered both halves of each pair and they could drift — completing
 * one never completed the other. Here a todo with a step_id is simply not
 * returned; its step is. A todo without one (personal work, and project todos
 * created since the migration) is returned as itself, so nothing is lost.
 *
 * Open/done is resolved through step_status_kind(), not by comparing against
 * 'completed': projects can define their own statuses, and a custom "Shipped"
 * column is just as done as the built-in one.
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext()
    if (!authContext) {
      return errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401)
    }
    const { userId } = authContext

    const view = new URL(request.url).searchParams.get('view') === 'done' ? 'done' : 'open'

    // Parent steps only — subtasks are reached through their parent, exactly as
    // on the project board, and listing them flat would bury the real tasks.
    const steps =
      view === 'open'
        ? await sql`
            SELECT ps.id, ps.title, ps.description, ps.status, ps.priority,
                   ps.end_date, ps.project_id, p.name AS project_name,
                   ps.created_at, ps.updated_at,
                   step_status_kind(ps.project_id, ps.status) AS status_kind
              FROM project_steps ps
              JOIN projects p ON p.id = ps.project_id
             WHERE p.user_id = ${userId}
               AND p.deleted_at IS NULL
               AND ps.deleted_at IS NULL
               AND ps.parent_task_id IS NULL
               AND step_status_kind(ps.project_id, ps.status) IN ('open', 'active')
          `
        : await sql`
            SELECT ps.id, ps.title, ps.description, ps.status, ps.priority,
                   ps.end_date, ps.project_id, p.name AS project_name,
                   ps.created_at, ps.updated_at,
                   step_status_kind(ps.project_id, ps.status) AS status_kind
              FROM project_steps ps
              JOIN projects p ON p.id = ps.project_id
             WHERE p.user_id = ${userId}
               AND p.deleted_at IS NULL
               AND ps.deleted_at IS NULL
               AND ps.parent_task_id IS NULL
               AND step_status_kind(ps.project_id, ps.status) = 'done'
             ORDER BY COALESCE(ps.completed_at, ps.updated_at) DESC
             LIMIT 300
          `

    const todos =
      view === 'open'
        ? await sql`
            SELECT t.id, t.title, t.description, t.status, t.priority,
                   t.due_date, t.project_id, p.name AS project_name,
                   t.created_at, t.updated_at
              FROM todos t
              LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
             WHERE t.user_id = ${userId}
               AND t.deleted_at IS NULL
               AND t.step_id IS NULL
               AND t.status <> 'completed'
          `
        : await sql`
            SELECT t.id, t.title, t.description, t.status, t.priority,
                   t.due_date, t.project_id, p.name AS project_name,
                   t.created_at, t.updated_at
              FROM todos t
              LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
             WHERE t.user_id = ${userId}
               AND t.deleted_at IS NULL
               AND t.step_id IS NULL
               AND t.status = 'completed'
             ORDER BY COALESCE(t.completed_at, t.updated_at) DESC
             LIMIT 300
          `

    /*
      Each project's real done/open status keys. A project can rename its done
      column ("Shipped"), so the client cannot complete a step by sending
      'completed' — that key may not be one of the project's columns, and the
      step would vanish from every column on the board. The client sends these
      keys through the EXISTING step PATCH route, which owns the side effects
      (completed_at, execution_history, the progress trigger); a parallel bulk
      write path would have to re-implement them and could drift from them.
    */
    const projectIds = [...new Set((steps as any[]).map((s) => s.project_id))]
    const statusRows = projectIds.length
      ? ((await sql`
          SELECT DISTINCT ON (project_id, kind) project_id, kind, key
            FROM project_statuses
           WHERE project_id = ANY(${projectIds})
             AND deleted_at IS NULL
             AND kind IN ('done', 'open')
           ORDER BY project_id, kind, order_index
        `) as any[])
      : []
    const statusKeys: Record<string, { done: string; open: string }> = {}
    for (const pid of projectIds) statusKeys[pid] = { done: 'completed', open: 'pending' }
    for (const r of statusRows) {
      if (r.kind === 'done') statusKeys[r.project_id].done = r.key
      if (r.kind === 'open') statusKeys[r.project_id].open = r.key
    }

    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)

    const items: WorkItem[] = [
      ...(steps as any[]).map((s) => ({
        kind: 'step' as const,
        id: s.id,
        title: s.title,
        description: s.description ?? null,
        status: s.status,
        statusKind: s.status_kind,
        priority: s.priority ?? null,
        dueDate: iso(s.end_date),
        projectId: s.project_id,
        projectName: s.project_name ?? null,
        createdAt: iso(s.created_at)!,
        updatedAt: iso(s.updated_at)!,
      })),
      ...(todos as any[]).map((t) => ({
        kind: 'todo' as const,
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        statusKind: (t.status === 'completed'
          ? 'done'
          : t.status === 'in_progress'
            ? 'active'
            : 'open') as WorkItem['statusKind'],
        priority: t.priority ?? null,
        dueDate: iso(t.due_date),
        projectId: t.project_id ?? null,
        projectName: t.project_name ?? null,
        createdAt: iso(t.created_at)!,
        updatedAt: iso(t.updated_at)!,
      })),
    ]

    return successResponse({
      view,
      items,
      statusKeys,
      counts: { steps: (steps as any[]).length, todos: (todos as any[]).length },
    })
  } catch (error) {
    console.error('Error fetching work:', error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch work', 500)
  }
}
