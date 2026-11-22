/**
 * POST /api/projects/[id]/readiness/sync   { ranAt?, results: [{ itemId, status: "pass" | "fail" | "warn" | "n/a", summary, findings? }] }
 *
 * Machine results from a scanner (the Comprehension extension, or any other). A pass on a code item is stored; a
 * pass on anything else becomes a proposal; a failure is recorded; an owner's decision is reopened only by a failure.
 */
import { type NextRequest } from "next/server"
import { ErrorCodes, errorResponse, successResponse } from "@/lib/api-utils"
import { readinessAuth, serverError } from "@/lib/readiness/route-auth"
import { applySync, getReadiness } from "@/lib/readiness/store"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const gate = await readinessAuth(id, "write")
    if (!gate.ok) return gate.response
    const body = (await request.json().catch(() => null)) as { ranAt?: unknown; results?: unknown } | null
    if (!body || typeof body !== "object") return errorResponse(ErrorCodes.BAD_REQUEST, "JSON body required", 400)
    const now = new Date().toISOString()
    const ranAt = typeof body.ranAt === "string" && !Number.isNaN(Date.parse(body.ranAt)) ? new Date(body.ranAt).toISOString() : now
    // Machine results are evidence, never an owner's decision, even when the signed-in owner uploads them.
    const { actor } = gate.acting({ source: "extension" })
    const r = await applySync(id, body.results, ranAt, { ...actor, kind: "agent", source: "extension" })
    if (!r.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, r.error, 400)
    const { readiness } = await getReadiness(id, now)
    return successResponse({ applied: r.applied, skipped: r.skipped, health: readiness?.health ?? null })
  } catch (error) {
    return serverError("sync", error)
  }
}
