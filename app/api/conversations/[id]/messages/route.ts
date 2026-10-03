/**
 * GET /api/conversations/[id]/messages — a chat's messages, for its owner.
 *
 * Had no authentication: anyone holding a conversation id could read it.
 * Now requires a session and ownership; "missing" and "not yours" both 404 so
 * ids can't be probed. Message shaping is shared with /chat/[id] via
 * lib/ai/chat-format.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getConversation, getConversationMessages } from "@/lib/ai/conversation-queries";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { toUIMessages, isUuid } from "@/lib/ai/chat-format";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const conversation = await getConversation(id);
    if (!conversation || conversation.userId !== auth.userId) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages = await getConversationMessages(id, { limit: 200 });
    return NextResponse.json({ conversation, messages: toUIMessages(messages as never[]) });
  } catch (error: unknown) {
    console.error("[Messages API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
