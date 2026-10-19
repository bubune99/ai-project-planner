import { NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { allowedAgentIds } from "@/lib/agents/agent-access"

export const dynamic = "force-dynamic"

/** Which in-app agents the signed-in person may pick (siblings: JARVIS only). */
export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ agents: [] }, { status: 401 })
  return NextResponse.json({ agents: allowedAgentIds(auth.userId) })
}
