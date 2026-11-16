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
import { AnsweredList } from "@/components/inbox/AnsweredList"
import Link from "next/link"

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deferred, setDeferred] = useState<string[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { credentials: "include" })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j?.error?.message || `HTTP ${res.status}`)
      setItems(j.data as InboxItem[])
      setError(null)
      setUpdatedAt(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load")
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Answered here this visit: shown first under "Just answered", each with Change my answer (walk 2026-11-16).
  const [justIds, setJustIds] = useState<string[]>([])
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const just = useMemo(() => justIds.map((id) => items?.find((i) => i.id === id)).filter(Boolean) as InboxItem[], [items, justIds])
  const waiting = useMemo(() => (items || []).filter((i) => !justIds.includes(i.id)), [items, justIds])

  // Deferred cards sink to the bottom, in the order they were put off.
  const ordered = useMemo(() => {
    if (!items) return []
    const now = waiting.filter((i) => !deferred.includes(i.id))
    const later = deferred.map((id) => waiting.find((i) => i.id === id)).filter(Boolean) as InboxItem[]
    return [...now, ...later]
  }, [items, waiting, deferred])

  const [answeredTick, setAnsweredTick] = useState(0)
  const answered = (id: string, answer?: string) => {
    setAnsweredTick((n) => n + 1)
    if (answer === undefined) { setItems((cur) => (cur ? cur.filter((i) => i.id !== id) : cur)); return }
    setChosen((c) => ({ ...c, [id]: answer }))
    setJustIds((j) => [id, ...j.filter((x) => x !== id)])
    setDeferred((d) => d.filter((x) => x !== id))
  }
  const undone = (id: string) => {
    setAnsweredTick((n) => n + 1)
    setJustIds((j) => j.filter((x) => x !== id))
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <div className="j-row j-between" style={{ alignItems: "baseline" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inbox</h1>
            <p className="j-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
              {items === null ? "Loading…" : waiting.length === 0 ? "Nothing waiting on you." : `${waiting.length} waiting on you`}
            </p>
          </div>
          {/* Refresh reloads both lists and says when: pressing it used to reload only what is waiting, with no sign it ran. */}
          <div className="j-row" style={{ alignItems: "baseline", gap: 10 }}>
            {updatedAt && <span className="j-muted" role="status" style={{ fontSize: 12 }}>{refreshing ? "Refreshing" : `Updated ${updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}</span>}
            <button className="j-btn j-btn-ghost" disabled={refreshing} onClick={async () => { setRefreshing(true); setAnsweredTick((n) => n + 1); await load(); setRefreshing(false) }} aria-label="Refresh inbox">Refresh</button>
          </div>
        </div>

        {error && (
          <div className="j-card" role="alert">
            <p className="j-neg" style={{ margin: 0, fontSize: 13 }}>Couldn&apos;t load the inbox: {error}</p>
          </div>
        )}

        {just.length > 0 && <h2 className="j-muted" style={{ fontSize: 13, fontWeight: 600, margin: "4px 0 0" }}>Just answered</h2>}
        {just.map((item) => (
          <QuestionCard
            key={item.id}
            item={item}
            deferred={false}
            onDefer={() => {}}
            answeredAs={chosen[item.id]}
            onAnswered={(a) => answered(item.id, a)}
            onUndone={() => undone(item.id)}
          />
        ))}
        {just.length > 0 && ordered.length > 0 && <h2 className="j-muted" style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 0" }}>Waiting on you</h2>}

        {items !== null && waiting.length === 0 && just.length === 0 && !error && (
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
            onBringBack={() => setDeferred((d) => d.filter((x) => x !== item.id))}
            onAnswered={(a) => answered(item.id, a)}
            onUndone={() => undone(item.id)}
          />
        ))}

        {/* What he reported and where each one stands (walk 2026-11-16: there was no way to follow a report). */}
        <Link href="/feedback?mine=1" className="opx-link" style={{ fontSize: 13.5, textDecoration: "underline", alignSelf: "flex-start" }}>My reports: what you pointed out and where each one stands</Link>

        {/* Where each answer went: not picked up, picked up by an agent, or finished. */}
        <AnsweredList refreshKey={answeredTick} onTakenBack={load} />
      </div>
    </DashboardLayout>
  )
}
