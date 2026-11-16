import { NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"

export const dynamic = "force-dynamic"

/**
 * GET /api/steps — every card on every board the caller may see (owner, or accepted collaborator), each with its
 * project's name. The all-projects board reads it.
 *
 * Owner, 2026-11-16: "The one shared board? That can be one but in the project itself it is filtered to just that
 * project, so tasks need to have tags or be identified to the project that they belong to. Macro task board to micro
 * task board". Cards done more than 30 days ago are left out: the board is for work, and the project's own board keeps
 * the full history.
 */
export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
  try {
    const steps = await sql`
      WITH mine AS (
        SELECT p.id, p.name FROM projects p
        WHERE p.deleted_at IS NULL
          AND (p.user_id = ${auth.userId}
               OR EXISTS (SELECT 1 FROM project_collaborators c
                          WHERE c.project_id = p.id AND c.user_id = ${auth.userId}
                            AND c.removed_at IS NULL AND c.accepted_at IS NOT NULL))
      )
      SELECT ps.*, mine.name AS project_name, '[]'::json AS dependencies
      FROM project_steps ps
      JOIN mine ON mine.id = ps.project_id
      WHERE ps.deleted_at IS NULL
        AND NOT (ps.status = 'completed' AND COALESCE(ps.completed_at, ps.updated_at) < NOW() - INTERVAL '30 days')
      ORDER BY mine.name ASC, ps.order_index ASC, ps.created_at ASC
      LIMIT 3000
    `
    return NextResponse.json({ steps })
  } catch (error) {
    console.error("GET /api/steps failed:", error)
    return NextResponse.json({ error: "Couldn't load the cards" }, { status: 500 })
  }
}
