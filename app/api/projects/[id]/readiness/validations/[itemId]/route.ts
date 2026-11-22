/**
 * One checklist item of a project's launch readiness.
 *
 * GET  /api/projects/[id]/readiness/validations/[itemId]   this item's history
 * POST /api/projects/[id]/readiness/validations/[itemId]   { state, reason?, evidence?, agent? }
 *
 * The owner, signed in, may set passed, failed, proposed or waived (a waiver needs a reason). An agent (an API key,
 * or agent: true from the owner's tab) passes only code items with check or scan evidence; its other passes are
 * stored as proposed, and it cannot waive. A collaborator who is not the owner cannot sign off.
 */
import { type NextRequest } from "next/server"
import { ErrorCodes, errorResponse, successResponse } from "@/lib/api-utils"
import { readinessAuth, serverError } from "@/lib/readiness/route-auth"
import { history, setValidation } from "@/lib/readiness/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string; itemId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { id, itemId } = await params
    const gate = await readinessAuth(id, "write")
    if (!gate.ok) return gate.response
    const body = (await request.json().catch(() => null)) as { state?: unknown; reason?: unknown; evidence?: unknown; agent?: unknown } | null
    if (!body || typeof body !== "object") return errorResponse(ErrorCodes.BAD_REQUEST, "JSON body required", 400)
    const who = gate.acting({ saysAgent: body.agent === true })
    if (who.role === "collaborator") return errorResponse(ErrorCodes.FORBIDDEN, "Only the project owner signs off a readiness item", 403)
    const r = await setValidation(id, itemId, body.state, { reason: body.reason, evidence: body.evidence }, who.actor)
    if (!r.ok) return errorResponse(r.status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR, r.error, r.status)
    return successResponse({ itemId, state: r.state, note: r.note ?? null })
  } catch (error) {
    return serverError("POST validation", error)
  }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { id, itemId } = await params
    const gate = await readinessAuth(id, "read")
    if (!gate.ok) return gate.response
    return successResponse(await history(id, itemId.slice(0, 80)))
  } catch (error) {
    return serverError("GET history", error)
  }
}
