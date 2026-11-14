/**
 * GET /api/push/prefs  → what the owner is told about, whether sending is set up, and how many devices are on
 * PUT /api/push/prefs  { prefs }  → save what to be told about
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db/client"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { getPrefs, savePrefs } from "@/lib/notify/owner"
import { pushConfigured } from "@/lib/push/send"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rows = (await sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${auth.userId} AND deleted_at IS NULL`) as { n: number }[]
  return NextResponse.json({ prefs: await getPrefs(auth.userId), configured: pushConfigured(), devices: rows[0]?.n ?? 0, publicKey: process.env.VAPID_PUBLIC_KEY ?? null })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await request.json().catch(() => null)
  return NextResponse.json({ prefs: await savePrefs(auth.userId, b?.prefs) })
}
