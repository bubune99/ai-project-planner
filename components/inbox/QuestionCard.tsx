"use client"

/*
 * One question an agent asked the owner, answerable in place: its options as
 * full-width buttons, "Reply instead" for words, "Not now" to put it off for
 * this visit. Used by /inbox and by a project's "Waiting on you".
 */

import { useState } from "react"
import { toast } from "sonner"
import type { InboxItem } from "@/lib/inbox"

export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ""
  const m = Math.round(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function QuestionCard({ item, deferred, onDefer, onAnswered, hideProject = false }: {
  item: InboxItem
  deferred: boolean
  onDefer: () => void
  onAnswered: () => void
  /** Inside a project the project name is already on the page. */
  hideProject?: boolean
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
        {item.projectName && !hideProject && <span className="j-pill j-proj" style={{ fontSize: 10.5 }}>{item.projectName}</span>}
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
