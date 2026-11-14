"use client"

/*
 * /inbox — questions waiting on the owner, answerable one-handed on a phone.
 *
 * Agents ask with the ask_owner MCP tool; each question is a card with its
 * options as full-width buttons (48px+ tap targets). One tap answers it. If no
 * option fits, "Reply instead" opens a text box; "Not now" moves the card to
 * the bottom for this visit without answering. The agent reads the answer
 * with get_answer. Rules (validation, card shape) live in lib/inbox.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/navigation"
import type { InboxItem } from "@/lib/inbox"
import { QuestionCard } from "@/components/inbox/QuestionCard"

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deferred, setDeferred] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { credentials: "include" })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j?.error?.message || `HTTP ${res.status}`)
      setItems(j.data as InboxItem[])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load")
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Deferred cards sink to the bottom, in the order they were put off.
  const ordered = useMemo(() => {
    if (!items) return []
    const now = items.filter((i) => !deferred.includes(i.id))
    const later = deferred.map((id) => items.find((i) => i.id === id)).filter(Boolean) as InboxItem[]
    return [...now, ...later]
  }, [items, deferred])

  const answered = (id: string) => {
    setItems((cur) => (cur ? cur.filter((i) => i.id !== id) : cur))
    setDeferred((d) => d.filter((x) => x !== id))
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <div className="j-row j-between" style={{ alignItems: "baseline" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inbox</h1>
            <p className="j-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
              {items === null ? "Loading…" : items.length === 0 ? "Nothing waiting on you." : `${items.length} waiting on you`}
            </p>
          </div>
          <button className="j-btn j-btn-ghost" onClick={load} aria-label="Refresh inbox">Refresh</button>
        </div>

        {error && (
          <div className="j-card" role="alert">
            <p className="j-neg" style={{ margin: 0, fontSize: 13 }}>Couldn&apos;t load the inbox: {error}</p>
          </div>
        )}

        {items !== null && items.length === 0 && !error && (
          <div className="j-card" style={{ padding: 40, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 15 }}>You&apos;re clear.</p>
            <p className="j-muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
              When an agent needs a decision from you, it shows up here.
            </p>
          </div>
        )}

        {ordered.map((item) => (
          <QuestionCard
            key={item.id}
            item={item}
            deferred={deferred.includes(item.id)}
            onDefer={() => setDeferred((d) => [...d.filter((x) => x !== item.id), item.id])}
            onAnswered={() => answered(item.id)}
          />
        ))}
      </div>
    </DashboardLayout>
  )
}
