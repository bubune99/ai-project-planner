/**
 * Launch readiness for one project.
 *
 * GET /api/projects/[id]/readiness   the launch profile, the computed health, every validation that applies, recent history
 * PUT /api/projects/[id]/readiness   { launchType, regions?, traits?, domain?, siteUrl?, agent? }   set the launch profile
 */
import { type NextRequest } from "next/server"
import { ErrorCodes, errorResponse, successResponse } from "@/lib/api-utils"
import { validateProfileInput } from "@/lib/readiness/input"
import { readinessAuth, serverError } from "@/lib/readiness/route-auth"
import { getReadiness, history, saveProfile } from "@/lib/readiness/store"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const gate = await readinessAuth(id, "read")
    if (!gate.ok) return gate.response
    const { profile, readiness } = await getReadiness(id, new Date().toISOString())
    return successResponse({ profile, readiness, history: profile ? await history(id, undefined, 30) : [] })
  } catch (error) {
    return serverError("GET", error)
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    const gate = await readinessAuth(id, "write")
    if (!gate.ok) return gate.response
    const body = await request.json().catch(() => null)
    const v = validateProfileInput(body)
    if (!v.ok) return errorResponse(ErrorCodes.VALIDATION_ERROR, v.error, 400)
    await saveProfile(id, v.value, gate.acting({ saysAgent: body?.agent === true }).actor)
    const { readiness } = await getReadiness(id, new Date().toISOString())
    return successResponse({ profile: v.value, readiness })
  } catch (error) {
    return serverError("PUT", error)
  }
}
