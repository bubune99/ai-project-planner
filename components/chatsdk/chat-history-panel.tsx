"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import useSWRInfinite from "swr/infinite"
import { useSWRConfig } from "swr"
import { getChatHistoryPaginationKey, type ChatHistory } from "./sidebar-history"

type ChatEntry = {
  id: string
  title: string
  createdAt: string | Date
}

function fetcher(url: string) {
  return fetch(url).then(r => r.json())
}

function groupByDate(chats: ChatEntry[]) {
  const now = new Date()
  const today: ChatEntry[] = []
  const yesterday: ChatEntry[] = []
  const week: ChatEntry[] = []
  const older: ChatEntry[] = []

  for (const c of chats) {
    const d = new Date(c.createdAt)
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) today.push(c)
    else if (diffDays === 1) yesterday.push(c)
    else if (diffDays <= 7) week.push(c)
    else older.push(c)
  }
  return { today, yesterday, week, older }
}

export function ChatHistoryPanel() {
  const params = useParams()
  const activeChatId = params?.id as string | undefined
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, setSize, isLoading } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  })

  const allChats = data?.flatMap(p => p.chats) ?? []
  const hasMore = data ? data.at(-1)?.hasMore ?? false : false
  const { today, yesterday, week, older } = groupByDate(allChats)

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return
    try {
      await fetch(`/api/chat?id=${id}`, { method: "DELETE" })
      mutate(key => typeof key === "string" && key.startsWith("/api/history"), undefined, { revalidate: true })
      if (id === activeChatId) router.push("/chat")
      toast.success("Conversation deleted")
    } catch {
      toast.error("Failed to delete")
    }
  }

  const Section = ({ label, items }: { label: string; items: ChatEntry[] }) => {
    if (!items.length) return null
    return (
      <div>
        <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.45 0 0)", padding: "6px 10px 2px", margin: 0 }}>{label}</p>
        {items.map(c => (
          <div
            key={c.id}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              borderRadius: 7, margin: "1px 4px",
              background: c.id === activeChatId ? "oklch(0.870 0.045 252 / 0.12)" : "transparent",
            }}
            onMouseEnter={e => { if (c.id !== activeChatId) (e.currentTarget as HTMLDivElement).style.background = "oklch(1 0 0 / 0.04)" }}
            onMouseLeave={e => { if (c.id !== activeChatId) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
          >
            <Link
              href={`/chat/${c.id}`}
              style={{
                flex: 1, padding: "6px 8px", fontSize: 12, color: c.id === activeChatId ? "var(--j-accent)" : "oklch(0.780 0 0)",
                textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {c.title || "Untitled"}
            </Link>
            <button
              onClick={() => handleDelete(c.id)}
              title="Delete"
              style={{
                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                color: "oklch(0.45 0 0)", padding: "4px 6px", fontSize: 12, borderRadius: 4,
                opacity: 0, transition: "opacity 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      width: 220, flexShrink: 0, borderRight: "1px solid var(--j-hairline)",
      display: "flex", flexDirection: "column", background: "oklch(0.135 0 0)", overflow: "hidden",
    }}>
      {/* Panel header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--j-hairline)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.780 0 0)", letterSpacing: "0.02em" }}>History</span>
        <button
          onClick={() => { router.push("/chat"); router.refresh() }}
          title="New chat"
          style={{ background: "oklch(0.870 0.045 252 / 0.15)", border: "1px solid oklch(0.870 0.045 252 / 0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--j-accent)", cursor: "pointer", fontFamily: "inherit" }}
        >
          + New
        </button>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
            {[60, 45, 80, 55, 70].map((w, i) => (
              <div key={i} style={{ height: 24, borderRadius: 6, background: "oklch(1 0 0 / 0.05)", width: `${w}%`, marginLeft: 10 }} />
            ))}
          </div>
        ) : allChats.length === 0 ? (
          <div style={{ padding: "24px 12px", textAlign: "center", color: "oklch(0.45 0 0)", fontSize: 12 }}>
            No conversations yet
          </div>
        ) : (
          <>
            <Section label="Today" items={today} />
            <Section label="Yesterday" items={yesterday} />
            <Section label="This week" items={week} />
            <Section label="Older" items={older} />
          </>
        )}

        {hasMore && (
          <button
            onClick={() => setSize(s => s + 1)}
            style={{ width: "100%", background: "none", border: "none", color: "oklch(0.556 0 0)", fontSize: 11, padding: "8px", cursor: "pointer", fontFamily: "inherit" }}
          >
            Load more
          </button>
        )}
      </div>

      {/* Footer: back to app */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--j-hairline)" }}>
        <Link href="/dashboard" style={{ fontSize: 11, color: "oklch(0.45 0 0)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          ← Dashboard
        </Link>
      </div>
    </div>
  )
}
