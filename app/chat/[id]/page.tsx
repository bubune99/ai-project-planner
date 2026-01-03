import { notFound } from "next/navigation";
import { Chat } from "@/components/chatsdk/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/chatsdk/ai/models";
import type { ChatMessage } from "@/lib/chatsdk/types";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

async function getConversation(id: string) {
  try {
    // Fetch conversation and messages from API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const response = await fetch(
      `${baseUrl}/api/conversations/${id}/messages`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error("Failed to fetch conversation");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[ChatPage] Error fetching conversation:", error);
    return null;
  }
}

export default async function ChatDetailPage({ params }: ChatPageProps) {
  const { id } = await params;

  // Fetch conversation data
  const conversationData = await getConversation(id);

  if (!conversationData) {
    notFound();
  }

  const { conversation, messages } = conversationData;

  // Transform messages to ChatMessage format
  const initialMessages: ChatMessage[] = messages.map((msg: any) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content || "",
    parts: msg.parts,
    toolInvocations: msg.toolInvocations,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
  }));

  // Check if there's an incomplete stream to resume
  const mostRecentMessage = initialMessages.at(-1);
  const mostRecentMessageAny = mostRecentMessage as any;
  const isStreamIncomplete =
    mostRecentMessage?.role === "assistant" &&
    mostRecentMessageAny?.toolInvocations?.some(
      (inv: any) => inv.state === "call" || inv.state === "partial-call"
    );

  return (
    <Chat
      id={id}
      initialMessages={initialMessages}
      initialChatModel={conversation?.modelId || DEFAULT_CHAT_MODEL}
      initialVisibilityType={conversation?.visibility || "private"}
      isReadonly={false}
      autoResume={isStreamIncomplete}
      initialLastContext={conversation?.metadata?.lastContext}
    />
  );
}
