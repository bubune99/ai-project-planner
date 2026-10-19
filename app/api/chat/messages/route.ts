import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { getConversation, getConversationMessages } from "@/lib/ai/conversation-queries"
import { toUIMessages, isUuid } from "@/lib/ai/chat-format"

export const dynamic = "force-dynamic"

/** GET /api/chat/messages?id=<uuid> — one of the caller's own conversations, as UI messages (for the assistant dock's history). */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!isUuid(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })
  const conversation = await getConversation(id)
  // Same answer for "missing" and "not yours", so ids cannot be probed.
  if (!conversation || conversation.userId !== auth.userId) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const rows = await getConversationMessages(id, { limit: 200 })
  return NextResponse.json({ id, messages: toUIMessages(rows as never[]) })
}
