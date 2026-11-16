/**
 * Undo a delete: bring a removed document or file back (Docs & files check, 2026-11-15: nothing on the tab could
 * be deleted, and a delete needs an Undo). Only the person who owns it, and only within a day of the delete.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: "Document not found" }, { status: 404 })
    const rows = (await sql`
      UPDATE documents SET deleted_at = NULL
       WHERE id = ${id} AND user_id = ${auth.userId}
         AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '1 day'
      RETURNING id, title
    `) as { id: string; title: string }[]
    if (!rows.length) return NextResponse.json({ error: "Document not found" }, { status: 404 })
    return NextResponse.json({ ok: true, id: rows[0].id, title: rows[0].title })
  } catch (e) {
    console.error("[documents/restore]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not bring it back" }, { status: 500 })
  }
}
