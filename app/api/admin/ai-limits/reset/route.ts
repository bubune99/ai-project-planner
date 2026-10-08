/**
 * POST /api/admin/ai-limits/reset
 *
 * Platform owner only (env PLANNER_ADMIN_USER_IDS — lib/auth/platform-admin.ts).
 * Body: { scope?: 'user'|'global'|'all', identity?: string, kind?: 'ai_tokens'|'rate'|'all' }
 * Same semantics as the reset_ai_limits MCP tool; logged to limit_resets.
 */

import { NextRequest } from "next/server"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { isPlatformAdmin } from "@/lib/auth/platform-admin"
import { planReset, resetLimits, type ResetOptions } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return errorResponse("UNAUTHORIZED", "Authentication required", 401)
  if (!isPlatformAdmin(auth.userId)) return errorResponse("FORBIDDEN", "Platform owner only", 403)

  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return errorResponse("VALIDATION_ERROR", "Body must be JSON", 400)
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("VALIDATION_ERROR", "Body must be a JSON object", 400)
  }
  const opts: ResetOptions = {
    scope: body.scope as ResetOptions["scope"],
    identity: typeof body.identity === "string" ? body.identity : undefined,
    kind: body.kind as ResetOptions["kind"],
  }
  const plan = planReset(opts)
  if (!plan.ok) return errorResponse("VALIDATION_ERROR", plan.error, 400)

  try {
    const result = await resetLimits(opts, { userId: auth.userId, via: "api:/api/admin/ai-limits/reset" })
    return successResponse({ reset: result })
  } catch (error) {
    console.error("[admin/ai-limits/reset] failed:", error)
    return errorResponse("INTERNAL_ERROR", "Reset failed", 500)
  }
}
