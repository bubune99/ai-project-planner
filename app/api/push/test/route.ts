/** POST /api/push/test → sends one notice to the caller's own devices, so they can see that it arrives. */
import { NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { sendPushToUser } from "@/lib/push/send"

export const dynamic = "force-dynamic"

export async function POST() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await sendPushToUser(auth.userId, { title: "Notifications are on", body: "This is what a question or a change to judge will look like.", url: "/inbox", tag: "test" })
  return NextResponse.json(r)
}
