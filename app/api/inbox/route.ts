/**
 * GET /api/inbox — what is waiting on the owner.
 *
 * Every agent_jobs row of the caller's in 'awaiting-unlock': questions asked
 * with the ask_owner MCP tool, plus jobs paused by request_unlock. Oldest
 * first, so nothing that has waited longest sinks under newer asks.
 */
import { NextRequest } from "next/server"
import { sql } from "@/lib/db/client"
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { toInboxItem } from "@/lib/inbox"

export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401)

    const rows = (await sql`
      SELECT id, title, unlock_prompt, created_by, assigned_to, created_at, input
      FROM agent_jobs
      WHERE status = 'awaiting-unlock' AND created_by = ${auth.userId}
      ORDER BY created_at ASC
      LIMIT 200
    `) as Record<string, any>[]

    const projectIds = Array.from(new Set(
      rows.map((r) => (typeof r.input === "object" && r.input?.projectId) || null).filter(Boolean) as string[]
    ))
    const projects = projectIds.length
      ? ((await sql`
          SELECT id, name FROM projects
          WHERE user_id = ${auth.userId} AND id = ANY(${projectIds}::uuid[]) AND deleted_at IS NULL
        `) as { id: string; name: string }[])
      : []
    const names = Object.fromEntries(projects.map((p) => [p.id, p.name]))

    const items = rows.map((r) => toInboxItem(r, names))
    return successResponse(items, { total: items.length, page: 1, limit: 200 })
  } catch (error: unknown) {
    console.error("GET /api/inbox failed:", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to load inbox", 500)
  }
}
