"use client"

/*
 * The frame of the full chat page: conversations on the left (a slide-over
 * drawer on phones) and the open conversation beside it. Lives in the layout
 * so the list stays put when you move between conversations.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { HISTORY_TOGGLE_EVENT, useIsNarrow } from "@/lib/chat/history-drawer"
import { HistoryList } from "./HistoryList"

export function ChatShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const activeId = useParams()?.id as string | undefined
  const narrow = useIsNarrow()
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    const toggle = () => setDrawer((v) => !v)
    window.addEventListener(HISTORY_TOGGLE_EVENT, toggle)
    return () => window.removeEventListener(HISTORY_TOGGLE_EVENT, toggle)
  }, [])
  useEffect(() => { setDrawer(false) }, [activeId, narrow])

  const newChat = () => { router.push("/chat"); router.refresh() }

  return (
    <div className="opx-chat-shell">
      {narrow && drawer && <div className="opx-chat-scrim" aria-hidden onClick={() => setDrawer(false)} />}
      <aside className={`opx-chat-side${narrow ? " drawer" : ""}${drawer ? " open" : ""}`} aria-hidden={narrow && !drawer} data-ui={narrow ? undefined : "chat.history"}>
        <div className="opx-chat-side-head">
          <b>Conversations</b>
          <button type="button" className="opx-btn sm" data-ui={narrow ? undefined : "chat.new"} onClick={newChat}><Plus size={14} strokeWidth={2} aria-hidden /> New</button>
        </div>
        <HistoryList activeId={activeId} onOpen={(id) => router.push(`/chat/${id}`)} onActiveDeleted={newChat} />
      </aside>
      <section className="opx-chat-main">{children}</section>
    </div>
  )
}
