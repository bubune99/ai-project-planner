/**
 * GET /api/projects/[id]/gates/changes/[changeId]/picture?which=before|after
 *
 * One change's picture, served from the planner's own address. The Changes tab compares the before and after pictures
 * in the browser to mark what changed, and a browser may only read the pixels of a picture from its own address.
 * Same access as the list of changes: the project's owner or someone it is shared with.
 */
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string; changeId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId, changeId } = await params
    const which = request.nextUrl.searchParams.get("which")
    if (!UUID.test(projectId) || !UUID.test(changeId) || (which !== "before" && which !== "after")) return NextResponse.json({ error: "Ask for which=before or which=after of a change" }, { status: 400 })
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const [row] = (await sql`SELECT before_key, after_key FROM gate_changes WHERE id = ${changeId} AND project_id = ${projectId}`) as { before_key: string; after_key: string }[]
    const key = row ? (which === "before" ? row.before_key : row.after_key) : null
    if (!key) return NextResponse.json({ error: "No such picture" }, { status: 404 })
    const { getSignedDownloadUrl, isR2Configured } = await import("@/lib/storage/r2-client")
    if (!isR2Configured()) return NextResponse.json({ error: "File storage is not configured on this server" }, { status: 503 })
    const res = await fetch(await getSignedDownloadUrl(key, 300))
    if (!res.ok || !res.body) return NextResponse.json({ error: "The picture could not be read" }, { status: 502 })
    const type = res.headers.get("content-type") || ""
    if (!/^image\/(png|jpeg|webp)$/.test(type)) return NextResponse.json({ error: "Not a picture" }, { status: 502 })
    return new NextResponse(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    console.error("change picture failed", error)
    return NextResponse.json({ error: "Could not load the picture" }, { status: 500 })
  }
}
