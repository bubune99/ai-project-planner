import { generateUUID } from "@/lib/chatsdk/utils";
import { Chat } from "@/components/chatsdk/chat";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { allowedAgentIds } from "@/lib/agents/agent-access";
import { DEFAULT_CHAT_MODEL } from "@/lib/chatsdk/ai/models";
import type { ChatMessage } from "@/lib/chatsdk/types";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const id = generateUUID();
  const auth = await getAuthContext();

  return (
    <Chat
      id={id}
      initialMessages={[] as ChatMessage[]}
      initialChatModel={DEFAULT_CHAT_MODEL}
      initialVisibilityType="private"
      isReadonly={false}
      autoResume={false}
      agentIds={allowedAgentIds(auth?.userId)}
    />
  );
}
