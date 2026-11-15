/**
 * GET /api/inbox/answered[?all=1] — what the owner has answered, and where each answer went.
 *
 * Newest first. By default only answers that are not finished: not picked up by any agent, or picked up and still
 * being worked. With all=1, finished ones too. The states and the line shown are from lib/queue/item-state.ts.
 */
import { NextRequest } from "next/server"
import { successResponse, errorResponse, ErrorCodes } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { openAnswers } from "@/lib/mcp/queue-tools"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return errorResponse(ErrorCodes.UNAUTHORIZED, "Authentication required", 401)
    const all = request.nextUrl.searchParams.get("all") === "1"
    const items = await openAnswers(auth.userId, { includeDone: all, sinceDays: all ? 14 : 30 })
    const names = new Map<string, string>()
    const ids = Array.from(new Set(items.map((i) => i.projectId).filter(Boolean) as string[]))
    if (ids.length) {
      const { sql } = await import("@/lib/db/client")
      const rows = (await sql`SELECT id, name FROM projects WHERE user_id = ${auth.userId} AND id = ANY(${ids}::uuid[]) AND deleted_at IS NULL`) as { id: string; name: string }[]
      for (const r of rows) names.set(r.id, r.name)
    }
    const data = items.map((i) => ({ ...i, projectName: i.projectId ? names.get(i.projectId) ?? null : null }))
    return successResponse(data, { total: data.length, page: 1, limit: 300 })
  } catch (error: unknown) {
    console.error("GET /api/inbox/answered failed:", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Failed to load what was answered", 500)
  }
}
