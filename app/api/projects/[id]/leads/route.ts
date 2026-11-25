/**
 * Leads: notes left on the owner's sites, kept in the planner (card 1711d9e8; rules lib/leads/lead-model.ts).
 *
 * POST  /api/projects/[id]/leads   { name, email, message, source, company?, topic?, ref? }   a site saves a note.
 *       A key made for this (scope leads:write) or the owner. 30 a minute per key.
 * GET   /api/projects/[id]/leads   the owner reads them (a leads-only key cannot).
 * PATCH /api/projects/[id]/leads   { id, status: new | replied | closed }   the owner marks one.
 */
import { type NextRequest, NextResponse } from "next/server"
import { getAuthContext, verifyProjectOwnership } from "@/lib/auth/auth-utils"
import { isUuid } from "@/lib/api/ids"
import { databaseUnavailableResponse } from "@/lib/db/unavailable"
import { checkRateLimit } from "@/lib/rate-limit"
import { canReadLeads, canWriteLeads, isLeadStatus, parseLead } from "@/lib/leads/lead-model"
import { listLeads, saveLead, setLeadStatus } from "@/lib/leads/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }
const NO_STORE = { "Cache-Control": "no-store" }
const notFound = () => NextResponse.json({ error: "Project not found" }, { status: 404, headers: NO_STORE })

async function access(params: Ctx["params"]) {
  const auth = await getAuthContext()
  if (!auth) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE }) }
  const { id: projectId } = await params
  if (!isUuid(projectId) || !(await verifyProjectOwnership(projectId, auth.userId))) return { res: notFound() }
  return { auth, projectId }
}

function failed(error: unknown, what: string) {
  const down = databaseUnavailableResponse(error)
  if (down) return down
  console.error(`leads: ${what} failed`, error)
  return NextResponse.json({ error: `Could not ${what}` }, { status: 500, headers: NO_STORE })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const a = await access(params)
    if (a.res) return a.res
    if (!canWriteLeads(a.auth)) return NextResponse.json({ error: "This key cannot save leads" }, { status: 403, headers: NO_STORE })
    if (!(await checkRateLimit(`leads:${a.auth.apiKeyId ?? a.auth.userId}`, 30, 60_000))) {
      return NextResponse.json({ error: "Too many notes; try again in a minute" }, { status: 429, headers: NO_STORE })
    }
    if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413, headers: NO_STORE })
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE }) }
    const parsed = parseLead(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })
    const { lead, created } = await saveLead(a.projectId, a.auth.userId, parsed.value)
    return NextResponse.json({ id: lead.id, created }, { status: created ? 201 : 200, headers: NO_STORE })
  } catch (error) {
    return failed(error, "save the lead")
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const a = await access(params)
    if (a.res) return a.res
    if (!canReadLeads(a.auth)) return NextResponse.json({ error: "This key cannot read leads" }, { status: 403, headers: NO_STORE })
    return NextResponse.json({ leads: await listLeads(a.projectId) }, { headers: NO_STORE })
  } catch (error) {
    return failed(error, "load leads")
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const a = await access(params)
    if (a.res) return a.res
    if (a.auth.authType !== "session" && !a.auth.scopes?.includes("write")) return NextResponse.json({ error: "This key cannot change leads" }, { status: 403, headers: NO_STORE })
    let body: { id?: unknown; status?: unknown }
    try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE }) }
    if (typeof body.id !== "string" || !isUuid(body.id)) return NextResponse.json({ error: "id is required" }, { status: 400, headers: NO_STORE })
    if (!isLeadStatus(body.status)) return NextResponse.json({ error: "status must be new, replied or closed" }, { status: 400, headers: NO_STORE })
    const lead = await setLeadStatus(a.projectId, body.id, body.status)
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ lead }, { headers: NO_STORE })
  } catch (error) {
    return failed(error, "change the lead")
  }
}
