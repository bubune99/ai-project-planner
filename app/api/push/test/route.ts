/**
 * POST /api/push/test            → sends one notice to the caller's own devices, so they can see that it arrives.
 * POST /api/push/test { buttons: true } → the same, with two buttons, to see whether this device shows them.
 * Only ever to the caller. The buttons change nothing: each opens Settings and says which one was pressed.
 */
import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { sendPushToUser } from "@/lib/push/send"

export const dynamic = "force-dynamic"

const back = (pressed: string) => `/settings?tab=notifications&pressed=${pressed}`

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { buttons?: unknown } | null
  const r = body?.buttons === true
    ? await sendPushToUser(auth.userId, {
        title: "A test with buttons",
        body: "Hold or swipe down on this notice. If two buttons show, press one.",
        url: back("notice"),
        tag: "test-buttons",
        actions: [
          { action: "first", title: "Looks good", url: back("first") },
          { action: "second", title: "Not now", url: back("second") },
        ],
      })
    : await sendPushToUser(auth.userId, { title: "Notifications are on", body: "This is what a question or a change to judge will look like.", url: "/inbox", tag: "test" })
  return NextResponse.json(r)
}
