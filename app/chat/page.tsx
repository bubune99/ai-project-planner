import { ChatThread } from "@/components/chat/ChatThread"
import { getAuthContext } from "@/lib/auth/auth-utils"
import { allowedAgentIds } from "@/lib/agents/agent-access"
import { DEFAULT_AGENT, newChatId } from "@/lib/chat/view"

export const dynamic = "force-dynamic"

export default async function ChatPage() {
  const auth = await getAuthContext()
  const id = newChatId()
  return <ChatThread key={id} id={id} initialMessages={[]} initialAgent={DEFAULT_AGENT} agentIds={allowedAgentIds(auth?.userId)} />
}
