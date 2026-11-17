import { NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { buildId } from "@/lib/pwa/build-id"

export const dynamic = "force-dynamic"

/**
 * GET /api/version: which build is live, so an open page can tell it is running an older one (card 1ff9465d,
 * components/pwa/NewBuildBar.tsx). Signed-in only, like every other route; it says nothing but the build id.
 */
export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
  return NextResponse.json({ build: buildId() }, { headers: { "Cache-Control": "no-store" } })
}
