import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { getSignedDownloadUrl, isR2Configured } from "@/lib/storage/r2-client"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/documents/:id/file
 * Redirects to a 10-minute signed link for an uploaded file. Only the owner
 * of the document's project (or the uploader) gets one; everyone else gets a
 * 404, the same as a document that doesn't exist.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const [doc] = (await sql`
      SELECT d.blob_key
      FROM documents d
      LEFT JOIN projects p ON p.id = d.project_id
      WHERE d.id = ${id}
        AND d.deleted_at IS NULL
        AND d.blob_key IS NOT NULL
        AND (p.user_id = ${auth.userId} OR d.user_id = ${auth.userId})
    `) as { blob_key: string }[]
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!isR2Configured()) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 })
    const url = await getSignedDownloadUrl(doc.blob_key, 600)
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("GET /api/documents/:id/file failed:", error)
    return NextResponse.json({ error: "Couldn't open the file" }, { status: 500 })
  }
}
