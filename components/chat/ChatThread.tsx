"use client"

/* One conversation on the full chat page. */

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { History, Menu, Plus } from "lucide-react"
import { OPEN_MENU_EVENT } from "@/components/navigation/dashboard-layout"
import { toggleHistoryDrawer, useIsNarrow } from "@/lib/chat/history-drawer"
import type { ChatMessage } from "@/lib/chat/view"
import { ChatPanel } from "./ChatPanel"
import { useAssistantChat } from "./useAssistantChat"

interface Props { id: string; initialMessages: ChatMessage[]; initialAgent: string; agentIds?: string[] }

export function ChatThread({ id, initialMessages, initialAgent, agentIds }: Props) {
  const router = useRouter()
  const narrow = useIsNarrow()
  const query = useSearchParams().get("query")
  // Once something is sent, the address names this conversation so a refresh reopens it.
  const model = useAssistantChat({ id, initialMessages, initialAgent, agentIds, onSend: () => window.history.replaceState({}, "", `/chat/${id}`) })
  const agent = model.agents.find((a) => a.id === model.agentId)

  // /chat?query=… (the Ask sheet on other pages) sends the question once.
  const sent = useRef(false)
  const send = model.send
  useEffect(() => {
    if (!query || sent.current) return
    sent.current = true
    send(query)
  }, [query, send])

  return (
    <>
      {narrow && (
        <header className="opx-chat-top">
          <button type="button" className="opx-ib" data-ui="chat.menu" aria-label="Open the menu" onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}><Menu size={18} strokeWidth={1.9} /></button>
          <div className="opx-chat-top-name">{agent && <><b>{agent.name}</b><small>{agent.description}</small></>}</div>
          <button type="button" className="opx-ib" data-ui="chat.history" aria-label="Conversations" onClick={toggleHistoryDrawer}><History size={18} strokeWidth={1.9} /></button>
          <button type="button" className="opx-ib" data-ui="chat.new" aria-label="New conversation" onClick={() => { router.push("/chat"); router.refresh() }}><Plus size={18} strokeWidth={1.9} /></button>
        </header>
      )}
      <ChatPanel model={model} />
    </>
  )
}
