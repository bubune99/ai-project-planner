/*
 * /chat/<id> — reopen a past chat.
 *
 * Reads the conversation on the server with the signed-in user's session and
 * checks ownership. It used to fetch its own /api/conversations endpoint over
 * HTTP from the server — without the session cookie, against
 * NEXT_PUBLIC_APP_URL or localhost — so every past chat opened as a 404.
 */
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/chat/ChatThread";
import { DEFAULT_AGENT, type ChatMessage } from "@/lib/chat/view";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getConversation, getConversationMessages } from "@/lib/ai/conversation-queries";
import { toUIMessages, isUuid } from "@/lib/ai/chat-format";
import { isAgentId } from "@/lib/agents/catalog";
import { allowedAgentIds } from "@/lib/agents/agent-access";

export const dynamic = "force-dynamic";

export default async function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const auth = await getAuthContext();
  if (!auth) notFound();

  const conversation = await getConversation(id);
  // Same answer for "missing" and "not yours", so ids can't be probed.
  if (!conversation || conversation.userId !== auth.userId) notFound();

  const rows = await getConversationMessages(id, { limit: 200 });
  const initialMessages = toUIMessages(rows as never[]) as unknown as ChatMessage[];

  return (
    <ChatThread
      key={id}
      id={id}
      initialMessages={initialMessages}
      initialAgent={isAgentId(conversation.modelId) ? conversation.modelId : DEFAULT_AGENT}
      agentIds={allowedAgentIds(auth.userId)}
    />
  );
}
