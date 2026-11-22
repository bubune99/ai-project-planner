/**
 * GET /api/projects/[id]/readiness/export   the launch readiness report as a Markdown file to download
 */
import { type NextRequest, NextResponse } from "next/server"
import { ErrorCodes, errorResponse } from "@/lib/api-utils"
import { sql } from "@/lib/db/client"
import { readinessMarkdown } from "@/lib/readiness/model"
import { readinessAuth, serverError } from "@/lib/readiness/route-auth"
import { getReadiness } from "@/lib/readiness/store"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const gate = await readinessAuth(id, "read")
    if (!gate.ok) return gate.response
    const now = new Date().toISOString()
    const { readiness } = await getReadiness(id, now)
    if (!readiness) return errorResponse(ErrorCodes.CONFLICT, "Set the launch profile first", 409)
    const [p] = (await sql`SELECT name FROM projects WHERE id = ${id}`) as { name: string }[]
    const today = now.slice(0, 10)
    const md = readinessMarkdown(p?.name ?? "Project", readiness, today)
    const slug = (p?.name ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project"
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="launch-readiness-${slug}-${today}.md"` } })
  } catch (error) {
    return serverError("export", error)
  }
}
