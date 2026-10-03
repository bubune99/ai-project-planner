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
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import type { InboxItem } from "@/lib/inbox"

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ""
  const m = Math.round(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

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

function QuestionCard({ item, deferred, onDefer, onAnswered }: {
  item: InboxItem
  deferred: boolean
  onDefer: () => void
  onAnswered: () => void
}) {
  const [sending, setSending] = useState<string | null>(null)
  const [replying, setReplying] = useState(item.options.length === 0)
  const [reply, setReply] = useState("")
  const [showContext, setShowContext] = useState(false)
  const longContext = (item.context?.length ?? 0) > 220

  const send = async (body: { option?: string; reply?: string }, label: string) => {
    setSending(label)
    try {
      const res = await fetch(`/api/inbox/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.info("Already answered")
        onAnswered()
        return
      }
      if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`)
      toast.success(`Answered: ${j.data?.answer?.note ?? label}`)
      onAnswered()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send")
      setSending(null)
    }
  }

  const busy = sending !== null

  return (
    <article className="j-card" style={{ opacity: deferred ? 0.7 : 1 }} aria-label={item.question}>
      <div className="j-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {item.projectName && <span className="j-pill j-proj" style={{ fontSize: 10.5 }}>{item.projectName}</span>}
        {item.kind === "unlock" && <span className="j-pill j-warn" style={{ fontSize: 10.5 }}>paused job</span>}
        <span className="j-muted" style={{ fontSize: 11 }}>
          {item.askedBy ? `${item.askedBy} · ` : ""}{ago(item.askedAt)}
          {deferred ? " · put off" : ""}
        </span>
      </div>

      <h2 style={{ fontSize: 16.5, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>{item.question}</h2>

      {item.context && (
        <div style={{ marginTop: 8 }}>
          <p className="j-muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
            {longContext && !showContext ? `${item.context.slice(0, 220)}…` : item.context}
          </p>
          {longContext && (
            <button className="j-btn j-btn-ghost" style={{ padding: "4px 0", fontSize: 12 }} onClick={() => setShowContext((v) => !v)}>
              {showContext ? "Less" : "More"}
            </button>
          )}
        </div>
      )}

      {item.options.length > 0 && (
        <div className="j-col" style={{ gap: 8, marginTop: 14 }}>
          {item.options.map((opt) => (
            <button
              key={opt}
              className="j-btn"
              disabled={busy}
              onClick={() => send({ option: opt }, opt)}
              style={{
                minHeight: 48, width: "100%", justifyContent: "flex-start", textAlign: "left",
                padding: "12px 14px", fontSize: 14.5, whiteSpace: "normal", lineHeight: 1.35,
                boxShadow: "inset 0 0 0 1px var(--j-ring)",
              }}
            >
              {sending === opt ? "Sending…" : opt}
            </button>
          ))}
        </div>
      )}

      {replying && (
        <div className="j-col" style={{ gap: 8, marginTop: 12 }}>
          <textarea
            aria-label={`Reply to: ${item.question}`}
            className="j-search"
            rows={3}
            placeholder={item.options.length ? "Say what you want instead…" : "Your answer…"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            style={{ resize: "vertical", height: "auto", padding: 12, fontSize: 15 }}
          />
          <button
            className="j-btn j-btn-primary"
            disabled={busy || !reply.trim()}
            onClick={() => send({ reply }, "reply")}
            style={{ minHeight: 44 }}
          >
            {sending === "reply" ? "Sending…" : "Send"}
          </button>
        </div>
      )}

      <div className="j-row" style={{ gap: 4, marginTop: 10 }}>
        {item.options.length > 0 && !replying && (
          <button className="j-btn j-btn-ghost" style={{ minHeight: 40 }} disabled={busy} onClick={() => setReplying(true)}>
            Reply instead
          </button>
        )}
        {!deferred && (
          <button className="j-btn j-btn-ghost" style={{ minHeight: 40, marginLeft: "auto" }} disabled={busy} onClick={onDefer}>
            Not now
          </button>
        )}
      </div>
    </article>
  )
}
