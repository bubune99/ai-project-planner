"use client"

/*
 * Past conversations, grouped by day. Used by the chat page (left column) and
 * the assistant panel (History). Deleting is permanent, so every path asks
 * first. Reads GET /api/history; deletes through DELETE /api/chat?id= and
 * DELETE /api/history.
 */

import { useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { groupChats, type ChatSummary } from "@/lib/chat/view"
import { HISTORY_CHANGED_EVENT } from "./useAssistantChat"

const PAGE = 30

interface Props {
  activeId?: string
  onOpen: (id: string) => void
  /** The open conversation was deleted. */
  onActiveDeleted?: () => void
  /** A conversation is being opened (shows it as busy). */
  busyId?: string | null
}

export function HistoryList({ activeId, onOpen, onActiveDeleted, busyId }: Props) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [working, setWorking] = useState(false)

  const load = useCallback(async (after?: string) => {
    try {
      const r = await fetch(`/api/history?limit=${PAGE}${after ? `&ending_before=${after}` : ""}`, { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      const page: ChatSummary[] = j.chats ?? []
      setChats((prev) => (after && prev ? [...prev, ...page] : page))
      setHasMore(!!j.hasMore)
      setError(null)
    } catch {
      setError("Couldn't load your conversations.")
      setChats((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    load()
    const refresh = () => { load() }
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh)
  }, [load])

  const pick = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const done = (ids: string[]) => { setPicked(new Set()); setSelecting(false); load(); if (activeId && ids.includes(activeId)) onActiveDeleted?.() }

  const remove = async (ids: string[]) => {
    if (!ids.length) return
    const what = ids.length === 1 ? "this conversation" : `${ids.length} conversations`
    if (!confirm(`Delete ${what}? This can't be undone.`)) return
    setWorking(true)
    const results = await Promise.allSettled(ids.map((id) => fetch(`/api/chat?id=${id}`, { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error(String(r.status)) })))
    setWorking(false)
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed) toast.error(`${failed} of ${ids.length} couldn't be deleted`)
    else toast.success(ids.length === 1 ? "Conversation deleted" : `Deleted ${ids.length} conversations`)
    done(ids)
  }

  const removeAll = async () => {
    if (!chats || !confirm(`Delete all ${chats.length}${hasMore ? "+" : ""} conversations? This can't be undone.`)) return
    setWorking(true)
    try {
      const r = await fetch("/api/history", { method: "DELETE" })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json().catch(() => ({}))
      toast.success(`Deleted ${j.deletedCount ?? "all"} conversations`)
      done(chats.map((c) => c.id))
    } catch {
      toast.error("Couldn't delete your history")
    } finally {
      setWorking(false)
    }
  }

  const all = chats ?? []
  return (
    <div className="opx-hist" data-ui="chat.history-list">
      {all.length > 0 && (
        <div className="opx-hist-bar">
          <button type="button" className="opx-link" aria-pressed={selecting} onClick={() => { setSelecting((v) => !v); setPicked(new Set()) }}>{selecting ? "Done" : "Select"}</button>
        </div>
      )}
      <div className="opx-hist-scroll">
        {chats === null && <p className="opx-muted opx-hist-note">Loading…</p>}
        {error && <p className="opx-hist-note" style={{ color: "var(--opx-hot)" }}>{error} <button type="button" className="opx-link" onClick={() => load()}>Try again</button></p>}
        {chats !== null && !error && all.length === 0 && <p className="opx-muted opx-hist-note">No conversations yet.</p>}
        {groupChats(all, new Date()).map(([label, list]) => (
          <div key={label}>
            <p className="opx-hist-day">{label}</p>
            {list.map((c) => (
              <div key={c.id} className={`opx-hist-row${c.id === activeId ? " on" : ""}`}>
                {selecting && <input type="checkbox" checked={picked.has(c.id)} onChange={() => pick(c.id)} aria-label={`Select ${c.title || "Untitled"}`} />}
                <button type="button" className="opx-hist-open" disabled={!!busyId} onClick={() => (selecting ? pick(c.id) : onOpen(c.id))}>
                  {busyId === c.id ? "Opening…" : c.title || "Untitled"}
                </button>
                {!selecting && (
                  <button type="button" className="opx-hist-del" aria-label={`Delete ${c.title || "Untitled"}`} title="Delete" disabled={working} onClick={() => remove([c.id])}><Trash2 size={14} strokeWidth={1.9} aria-hidden /></button>
                )}
              </div>
            ))}
          </div>
        ))}
        {hasMore && <button type="button" className="opx-link opx-hist-more" onClick={() => load(all.at(-1)?.id)}>Load more</button>}
      </div>
      {selecting && (
        <div className="opx-hist-actions">
          <span className="opx-row" style={{ gap: 6 }}>
            <button type="button" className="opx-btn sm" disabled={working} onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all.map((c) => c.id)))}>{picked.size === all.length ? "Clear" : "Select all"}</button>
            <button type="button" className="opx-btn sm" disabled={working || picked.size === 0} onClick={() => remove([...picked])}>{working ? "Deleting…" : `Delete ${picked.size || ""}`.trim()}</button>
          </span>
          <button type="button" className="opx-link" disabled={working} onClick={removeAll}>Delete all conversations</button>
        </div>
      )}
    </div>
  )
}
