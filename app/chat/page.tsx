import { generateUUID } from "@/lib/chatsdk/utils";
import { Chat } from "@/components/chatsdk/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/chatsdk/ai/models";
import type { ChatMessage } from "@/lib/chatsdk/types";

export default async function ChatPage() {
  const id = generateUUID();

  return (
    <Chat
      id={id}
      initialMessages={[] as ChatMessage[]}
      initialChatModel={DEFAULT_CHAT_MODEL}
      initialVisibilityType="private"
      isReadonly={false}
      autoResume={false}
    />
  );
}
