/**
 * Guides: the stack entries and taste statements that become checks.
 *
 * GET  /api/gates/guides[?projectId=][&as=rules]  the guides, or the rules they compile to (for the plugin)
 * POST /api/gates/guides
 *        { action: "install-defaults" }
 *        { action: "save", guide: { kind, name, summary, skill?, applies, checks, status, source, basis }, projectId? }
 *        { action: "status", id, status: "active" | "draft" }
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { GateError } from "@/lib/gates/store"
import { installDefaults, listGuides, rulesFor, saveGuide, setGuideStatus } from "@/lib/gates/guide-store"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function projectOf(raw: unknown, userId: string): Promise<string | null | false> {
  if (raw === undefined || raw === null || raw === "") return null
  if (typeof raw !== "string" || !UUID.test(raw) || !(await verifyProjectOwnership(raw, userId))) return false
  return raw
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const projectId = await projectOf(request.nextUrl.searchParams.get("projectId"), auth.userId)
    if (projectId === false) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (request.nextUrl.searchParams.get("as") === "rules") return NextResponse.json(await rulesFor(auth.userId, projectId))
    return NextResponse.json({ guides: await listGuides(auth.userId, projectId) })
  } catch (error) {
    console.error("guides load failed", error)
    return NextResponse.json({ error: "Could not load the guides" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const b = await request.json().catch(() => null)
    if (b?.action === "install-defaults") return NextResponse.json(await installDefaults(auth.userId))
    if (b?.action === "status") {
      if (typeof b.id !== "string" || !UUID.test(b.id) || !["active", "draft"].includes(b.status)) return NextResponse.json({ error: "Send { id, status }" }, { status: 400 })
      await setGuideStatus(auth.userId, b.id, b.status)
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "save" && b.guide && typeof b.guide === "object") {
      const projectId = await projectOf(b.projectId, auth.userId)
      if (projectId === false) return NextResponse.json({ error: "Project not found" }, { status: 404 })
      const g = b.guide
      return NextResponse.json(await saveGuide(auth.userId, {
        kind: g.kind, name: String(g.name ?? ""), summary: String(g.summary ?? ""), skill: typeof g.skill === "string" ? g.skill : undefined,
        applies: { files: Array.isArray(g.applies?.files) ? g.applies.files.map(String) : undefined, imports: Array.isArray(g.applies?.imports) ? g.applies.imports.map(String) : undefined },
        checks: Array.isArray(g.checks) ? g.checks.map((c: Record<string, unknown>) => ({ id: String(c.id ?? ""), say: String(c.say ?? ""), ...(typeof c.auto === "string" ? { auto: c.auto } : {}) })) : [],
        status: g.status === "draft" ? "draft" : "active", source: ["owner", "research", "agent"].includes(g.source) ? g.source : "agent", basis: String(g.basis ?? ""),
      }, projectId))
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("guides write failed", error)
    return NextResponse.json({ error: "Could not save that" }, { status: 500 })
  }
}
