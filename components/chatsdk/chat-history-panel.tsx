"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import useSWRInfinite from "swr/infinite"
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // Select mode: tick several chats and delete them together, or clear all.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const togglePick = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  // useSWRInfinite caches under a "$inf$/api/history…" key, so a global
  // mutate matching keys that start with "/api/history" never hit it and the
  // list kept showing deleted chats. The hook's own mutate always does.
  const refreshHistory = () => { void reloadHistory() }

  // No fallbackData: with fallbackData: [] SWR treated the empty list as data
  // it already had and never fetched on mount — the panel stayed empty until
  // a sent message's onFinish forced a refresh, so past chats never showed.
  const { data, setSize, isLoading, mutate: reloadHistory } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    revalidateOnMount: true,
  })

  const allChats = data?.flatMap(p => p.chats) ?? []
  const hasMore = data ? data.at(-1)?.hasMore ?? false : false
  const { today, yesterday, week, older } = groupByDate(allChats)

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return
    try {
      await fetch(`/api/chat?id=${id}`, { method: "DELETE" })
      refreshHistory()
      if (id === activeChatId) router.push("/chat")
      toast.success("Conversation deleted")
    } catch {
      toast.error("Failed to delete")
    }
  }

  // Deletion is permanent (messages cascade), so every path confirms first.
  const deletePicked = async () => {
    const ids = [...picked]
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} conversation${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return
    setBusy(true)
    const results = await Promise.allSettled(ids.map(id => fetch(`/api/chat?id=${id}`, { method: "DELETE" }).then(r => { if (!r.ok) throw new Error(String(r.status)) })))
    const failed = results.filter(r => r.status === "rejected").length
    setBusy(false)
    setPicked(new Set())
    setSelecting(false)
    refreshHistory()
    if (activeChatId && ids.includes(activeChatId)) router.push("/chat")
    failed ? toast.error(`${failed} of ${ids.length} could not be deleted`) : toast.success(`Deleted ${ids.length} conversation${ids.length === 1 ? "" : "s"}`)
  }

  const deleteAll = async () => {
    if (!confirm(`Delete all ${allChats.length}${hasMore ? "+" : ""} conversations? This can't be undone.`)) return
    setBusy(true)
    try {
      const r = await fetch("/api/history", { method: "DELETE" })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json().catch(() => ({}))
      toast.success(`Deleted ${j.deletedCount ?? "all"} conversations`)
      setSelecting(false)
      setPicked(new Set())
      refreshHistory()
      router.push("/chat")
    } catch {
      toast.error("Failed to delete history")
    } finally {
      setBusy(false)
    }
  }

  // A render function, not a component: declaring `const Section = () =>` in
  // the body made a new component type every render, so React remounted the
  // whole list on each state change (a tick in Select mode rebuilt every row,
  // dropping focus and detaching what you were about to click).
  const renderSection = (label: string, items: ChatEntry[]) => {
    if (!items.length) return null
    return (
      <div key={label}>
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
            {selecting && (
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => togglePick(c.id)}
                aria-label={`Select ${c.title || "Untitled"}`}
                style={{ marginLeft: 6, accentColor: "var(--j-accent)", flexShrink: 0 }}
              />
            )}
            <Link
              href={`/chat/${c.id}`}
              onClick={selecting ? (e) => { e.preventDefault(); togglePick(c.id) } : undefined}
              style={{
                flex: 1, padding: "6px 8px", fontSize: 12, color: c.id === activeChatId ? "var(--j-accent)" : "oklch(0.780 0 0)",
                textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {c.title || "Untitled"}
            </Link>
            {/* Was opacity 0 until hovered — invisible, and unreachable on touch. */}
            {!selecting && (
              <button
                onClick={() => handleDelete(c.id)}
                title="Delete conversation"
                aria-label={`Delete ${c.title || "Untitled"}`}
                style={{
                  flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                  color: "oklch(0.55 0 0)", padding: "4px 7px", fontSize: 12, borderRadius: 4,
                  opacity: 0.5, transition: "opacity 0.1s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--j-neg)" }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "oklch(0.55 0 0)" }}
              >
                ✕
              </button>
            )}
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
        {allChats.length > 0 && (
          <button
            onClick={() => { setSelecting(v => !v); setPicked(new Set()) }}
            aria-pressed={selecting}
            style={{ marginLeft: "auto", marginRight: 6, background: "none", border: "none", fontSize: 11, color: selecting ? "var(--j-accent)" : "oklch(0.556 0 0)", cursor: "pointer", fontFamily: "inherit" }}
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
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
            {renderSection("Today", today)}
            {renderSection("Yesterday", yesterday)}
            {renderSection("This week", week)}
            {renderSection("Older", older)}
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

      {selecting && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--j-hairline)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setPicked(picked.size === allChats.length ? new Set() : new Set(allChats.map(c => c.id)))}
              disabled={busy}
              style={{ flex: 1, background: "none", border: "1px solid var(--j-ring)", borderRadius: 6, padding: "5px 6px", fontSize: 11, color: "oklch(0.78 0 0)", cursor: "pointer", fontFamily: "inherit" }}
            >
              {picked.size === allChats.length ? "Clear" : "Select all"}
            </button>
            <button
              onClick={deletePicked}
              disabled={busy || picked.size === 0}
              style={{ flex: 1, background: picked.size ? "oklch(0.577 0.245 27 / 0.18)" : "none", border: "1px solid oklch(0.577 0.245 27 / 0.35)", borderRadius: 6, padding: "5px 6px", fontSize: 11, color: "var(--j-neg)", cursor: picked.size ? "pointer" : "default", opacity: picked.size ? 1 : 0.5, fontFamily: "inherit" }}
            >
              {busy ? "Deleting…" : `Delete ${picked.size || ""}`.trim()}
            </button>
          </div>
          <button
            onClick={deleteAll}
            disabled={busy}
            style={{ background: "none", border: "none", padding: "2px", fontSize: 11, color: "oklch(0.55 0 0)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
          >
            Delete all conversations
          </button>
        </div>
      )}

      {/* Footer: back to app */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--j-hairline)" }}>
        <Link href="/dashboard" style={{ fontSize: 11, color: "oklch(0.45 0 0)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          ← Dashboard
        </Link>
      </div>
    </div>
  )
}
