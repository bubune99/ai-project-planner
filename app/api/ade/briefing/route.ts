import { NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"

export const dynamic = "force-dynamic"

/** GET /api/ade/briefing — the assistant's one-line briefing: counts from the caller's own todos. */
export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status <> 'completed' AND due_date IS NOT NULL AND due_date::date = CURRENT_DATE)::int AS due_today,
      COUNT(*) FILTER (WHERE status <> 'completed' AND due_date IS NOT NULL AND due_date::date < CURRENT_DATE)::int AS overdue,
      COUNT(*) FILTER (WHERE status <> 'completed')::int AS open
    FROM todos
    WHERE user_id = ${auth.userId} AND deleted_at IS NULL
  `) as { due_today: number; overdue: number; open: number }[]
  const r = rows[0] ?? { due_today: 0, overdue: 0, open: 0 }
  return NextResponse.json({ dueToday: r.due_today, overdue: r.overdue, open: r.open })
}
