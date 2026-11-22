/**
 * Code-check results: what the far-gates plugin found when it ran a rule on a file (rules: lib/gates/code-results.ts).
 *
 * GET  /api/projects/[id]/gates/code-results   where the project's files stand now, by rule:
 *        { kept, files, rules: [{ rule, guideId, guide, files, owed, passed, failed, waived, lastFailed, lastAt }] }
 *        503 with a sentence while the table is not there (migration 088).
 * POST /api/projects/[id]/gates/code-results
 *        { results: [{ rule, file, status: "owed" | "passed" | "failed" | "waived", note?, at? }], source?, agent?, agentName? }
 *        Up to 500 at once. Kept by project, rule and file: sending the same result again changes nothing, and a
 *        result older than the one kept is left out. Answers { received, saved, changes, tiedToAGuide }.
 *        503 with a sentence while the table is not there: nothing was saved, send it again later.
 *
 * A browser session is the owner; an agent, including one saving through the owner's signed-in tab, sends
 * agent: true (and agentName), and an API key is always an agent. Only the owner can send "waived".
 *
 * Answers in the envelope (lib/api-utils.ts): { success: true, data } or { success: false, error: { code, message } }.
 * The table not being there is code NOT_KEPT_YET with status 503; the sentence is in error.message.
 */
import { type NextRequest } from "next/server"
import { ErrorCodes, errorResponse, successResponse } from "@/lib/api-utils"
import { getAuthContext, verifyProjectOwnership, verifyProjectWriteAccess } from "@/lib/auth/auth-utils"
import { NOT_KEPT_YET, parseResults } from "@/lib/gates/code-results"
import { projectCodeResults, ResultsNotKept, saveCodeResults } from "@/lib/gates/code-result-store"
import { listGuides } from "@/lib/gates/guide-store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unauthorized = () => errorResponse(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401)
const noProject = () => errorResponse(ErrorCodes.NOT_FOUND, "Project not found", 404)
const notKept = (more = "") => errorResponse("NOT_KEPT_YET", `${NOT_KEPT_YET}${more}`, 503)

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()
    const { id: projectId } = await params
    if (!UUID.test(projectId) || !(await verifyProjectOwnership(projectId, auth.userId))) return noProject()
    const out = await projectCodeResults(projectId, await listGuides(auth.userId, projectId))
    return out.kept ? successResponse(out) : notKept()
  } catch (error) {
    console.error("code results load failed", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Could not load the check results", 500)
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()
    const { id: projectId } = await params
    if (!UUID.test(projectId) || !(await verifyProjectWriteAccess(projectId, auth.userId))) return noProject()
    const parsed = parseResults(await request.json().catch(() => null), { now: new Date().toISOString(), asOwner: auth.authType === "session" })
    if (!parsed.ok) return errorResponse(parsed.status === 403 ? ErrorCodes.FORBIDDEN : ErrorCodes.VALIDATION_ERROR, parsed.error, parsed.status)
    const guides = (await listGuides(auth.userId, projectId)).map((g) => ({ id: g.id, name: g.name, projectId: g.project_id, checks: g.checks }))
    return successResponse(await saveCodeResults({ projectId, userId: auth.userId, guides, results: parsed.results, actor: parsed.actor, who: parsed.who, source: parsed.source }))
  } catch (error) {
    if (error instanceof ResultsNotKept) return notKept(" Nothing was saved.")
    console.error("code results save failed", error)
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "Could not save the check results", 500)
  }
}
