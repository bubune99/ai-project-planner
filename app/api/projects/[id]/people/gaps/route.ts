/**
 * GET /api/projects/[id]/people/gaps   what the project's People and flows still lacks, and who fills each gap
 *
 * Read by the People and flows tab and by far-gates' finish check (an agent may not finish while one of its gaps is
 * open). Rules in lib/people/gaps.ts.
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { projectGaps } from "@/lib/people/gap-store"
import { isUuid } from "@/lib/api/ids"
import { databaseUnavailableResponse } from "@/lib/db/unavailable"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id: projectId } = await params
    if (!isUuid(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (!(await verifyProjectOwnership(projectId, auth.userId))) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    return NextResponse.json(await projectGaps(projectId))
  } catch (error) {
    const down = databaseUnavailableResponse(error)
    if (down) return down
    console.error("people gaps load failed", error)
    return NextResponse.json({ error: "Could not work out what is missing" }, { status: 500 })
  }
}
