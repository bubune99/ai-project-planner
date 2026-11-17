/**
 * Remove a note from a project's activity, or bring it back (Undo). Project Overview check, 2026-11-15: a note could
 * not be removed or corrected from the page. A removal is a flag in the note's metadata (the table has no deleted
 * column), so Undo is exact. Allowed for the person who wrote the note and for anyone who may write to the project.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function mayChange(id: string, userId: string): Promise<boolean> {
  const [n] = (await sql`SELECT project_id, user_id FROM progress_notes WHERE id = ${id}`) as { project_id: string; user_id: string | null }[]
  if (!n) return false
  // The writer, or someone who may write to the project (a viewer may not remove other people's notes; card d81ee324 sweep).
  return n.user_id === userId || (await verifyProjectWriteAccess(n.project_id, userId))
}

async function setRemoved(request: NextRequest, params: Promise<{ id: string }>, removed: boolean) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    if (!UUID.test(id) || !(await mayChange(id, auth.userId))) return NextResponse.json({ error: "Note not found" }, { status: 404 })
    await sql`
      UPDATE progress_notes
         SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(removed ? { deleted: true, deletedAt: new Date().toISOString() } : { deleted: false })}::jsonb
       WHERE id = ${id}
    `
    return NextResponse.json({ ok: true, id, removed })
  } catch (e) {
    console.error("[progress-notes] remove/restore failed", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not change the note" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setRemoved(request, params, true)
}

/** Undo a removal. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return setRemoved(request, params, false)
}
