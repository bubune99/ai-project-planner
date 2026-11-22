/**
 * Guides: the stack entries and taste statements that become checks.
 *
 * GET  /api/gates/guides[?projectId=][&as=rules]  the guides, or the rules they compile to (for the plugin)
 * GET  /api/gates/guides?versions=<guide id>      every kept version of one guide, newest first
 * GET  /api/gates/guides?ledger=1[&projectId=]    each guide's numbers, by guide id (rules: lib/gates/guide-ledger.ts)
 * POST /api/gates/guides
 *        { action: "install-defaults" }
 *        { action: "save", guide: { kind, name, summary, skill?, applies, checks, status, source, basis }, projectId? }
 *        { action: "status", id, status: "active" | "draft" }
 *        { action: "trial", id, until: "YYYY-MM-DD" | null, today? }   owner only: on trial until a day, or (null) permanent
 *        { action: "restore", id, version }                             owner only: restoring is itself a new version
 *
 * Every write is kept as a version with who made it. A browser session is the owner; an agent, including one saving
 * through the owner's signed-in tab, sends agent: true (and agentName), and an API key is always an agent.
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { GateError } from "@/lib/gates/store"
import { guideLedgers, installDefaults, listGuides, listGuideVersions, restoreGuideVersion, rulesFor, saveGuide, setGuideStatus, setGuideTrial } from "@/lib/gates/guide-store"
import { clientDay, type Saver } from "@/lib/gates/guides"

export const dynamic = "force-dynamic"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reading a project's guides needs to be on the project; saving one to it needs write access (viewers may not). */
async function projectOf(raw: unknown, userId: string, write = false): Promise<string | null | false> {
  if (raw === undefined || raw === null || raw === "") return null
  if (typeof raw !== "string" || !UUID.test(raw)) return false
  const ok = write ? await verifyProjectWriteAccess(raw, userId) : await verifyProjectOwnership(raw, userId)
  return ok ? raw : false
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const projectId = await projectOf(request.nextUrl.searchParams.get("projectId"), auth.userId)
    if (projectId === false) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    const versionsOf = request.nextUrl.searchParams.get("versions")
    if (versionsOf !== null) {
      if (!UUID.test(versionsOf)) return NextResponse.json({ error: "Send the guide's id" }, { status: 400 })
      return NextResponse.json(await listGuideVersions(auth.userId, versionsOf))
    }
    if (request.nextUrl.searchParams.get("ledger") === "1") return NextResponse.json(await guideLedgers(auth.userId, projectId))
    if (request.nextUrl.searchParams.get("as") === "rules") return NextResponse.json(await rulesFor(auth.userId, projectId))
    return NextResponse.json({ guides: await listGuides(auth.userId, projectId) })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 404 })
    console.error("guides load failed", error)
    return NextResponse.json({ error: "Could not load the guides" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const b = await request.json().catch(() => null)
    const by: Saver = auth.authType === "session" && b?.agent !== true ? { kind: "owner" } : { kind: "agent", name: typeof b?.agentName === "string" ? b.agentName : "" }
    if (b?.action === "install-defaults") return NextResponse.json(await installDefaults(auth.userId, by))
    if (b?.action === "status") {
      if (typeof b.id !== "string" || !UUID.test(b.id) || !["active", "draft"].includes(b.status)) return NextResponse.json({ error: "Send { id, status }" }, { status: 400 })
      await setGuideStatus(auth.userId, b.id, b.status, by)
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "trial") {
      if (typeof b.id !== "string" || !UUID.test(b.id) || !(b.until === null || typeof b.until === "string")) return NextResponse.json({ error: "Send { id, until }: a date, or null for permanent" }, { status: 400 })
      await setGuideTrial(auth.userId, b.id, b.until, by, clientDay(b.today, new Date().toISOString().slice(0, 10)))
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "restore") {
      if (typeof b.id !== "string" || !UUID.test(b.id) || !Number.isInteger(b.version) || b.version < 1) return NextResponse.json({ error: "Send { id, version }" }, { status: 400 })
      await restoreGuideVersion(auth.userId, b.id, b.version, by)
      return NextResponse.json({ ok: true })
    }
    if (b?.action === "save" && b.guide && typeof b.guide === "object") {
      const projectId = await projectOf(b.projectId, auth.userId, true)
      if (projectId === false) return NextResponse.json({ error: "Project not found" }, { status: 404 })
      const g = b.guide
      return NextResponse.json(await saveGuide(auth.userId, {
        kind: g.kind, name: String(g.name ?? ""), summary: String(g.summary ?? ""), skill: typeof g.skill === "string" ? g.skill : undefined,
        applies: { files: Array.isArray(g.applies?.files) ? g.applies.files.map(String) : undefined, imports: Array.isArray(g.applies?.imports) ? g.applies.imports.map(String) : undefined },
        checks: Array.isArray(g.checks) ? g.checks.map((c: Record<string, unknown>) => ({ id: String(c.id ?? ""), say: String(c.say ?? ""), ...(typeof c.auto === "string" ? { auto: c.auto } : {}) })) : [],
        status: g.status === "draft" ? "draft" : "active", source: ["owner", "research", "agent"].includes(g.source) ? g.source : "agent", basis: String(g.basis ?? ""),
      }, projectId, by))
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof GateError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("guides write failed", error)
    return NextResponse.json({ error: "Could not save that" }, { status: 500 })
  }
}
