"use client"

/*
 * One question an agent asked the owner, answerable in place: its options as
 * full-width buttons, "Reply instead" for words, "Not now" to put it off for
 * this visit. Used by /inbox, the dashboard and a project's "Waiting on you" (one card, one name: walk 2026-11-16).
 * After answering it stays in place with what was chosen and "Change my answer". The project tag, the card it is
 * about and any address in its text are links (lib/inbox/links.ts).
 */

import { useState } from "react"
import Link from "next/link"
import { linkParts, questionHrefs } from "@/lib/inbox/links"
import { QuestionPictures } from "./QuestionPictures"
import { announceInbox } from "@/lib/inbox/live"
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

function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        "href" in p
          ? p.external
            ? <a key={i} href={p.href} target="_blank" rel="noreferrer" className="opx-link" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{p.text}</a>
            : <Link key={i} href={p.href} className="opx-link" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{p.text}</Link>
          : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

export function QuestionCard({ item, deferred, onDefer, onBringBack, onAnswered, onUndone, answeredAs, hideProject = false, compact = false }: {
  item: InboxItem
  deferred: boolean
  onDefer: () => void
  /** Undo "Not now". Without it a question put off could not be brought back short of reloading the page. */
  onBringBack?: () => void
  /** Called with what was chosen (or the reply). */
  onAnswered: (answer?: string) => void
  /** Called after "Change my answer" puts the question back. */
  onUndone?: () => void
  /** Inside a project the project name is already on the page. */
  hideProject?: boolean
  /** Already answered on this visit: show the answer and Change my answer (the card is drawn again when it moves). */
  answeredAs?: string
  /** The dashboard's smaller form: options side by side. */
  compact?: boolean
}) {
  const [done, setDone] = useState<string | null>(answeredAs ?? null)
  const [gone, setGone] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const hrefs = questionHrefs(item)
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
        announceInbox()
        setGone(true)
        onAnswered()
        return
      }
      if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`)
      const chosen = label === "reply" ? reply.trim() : label
      setDone(chosen)
      setSending(null)
      announceInbox(-1)
      onAnswered(chosen)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send")
      setSending(null)
    }
  }

  const busy = sending !== null

  const takeBack = async () => {
    setUndoing(true)
    try {
      const res = await fetch(`/api/inbox/${item.id}`, { method: "DELETE", credentials: "include" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`)
      setDone(null)
      announceInbox(1)
      onUndone?.()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't take the answer back")
    } finally {
      setUndoing(false)
    }
  }

  const project = item.projectName && !hideProject
    ? hrefs.project
      ? <Link href={hrefs.project} className="j-pill j-proj" style={{ fontSize: 12, textDecoration: "none" }}>{item.projectName}</Link>
      : <span className="j-pill j-proj" style={{ fontSize: 12 }}>{item.projectName}</span>
    : null

  if (gone) return null
  if (done !== null) {
    return (
      <article className="j-card" data-answered aria-label={item.question}>
        <div className="j-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>{project}</div>
        <h2 style={{ fontSize: compact ? 15 : 16.5, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>{item.question}</h2>
        <div className="j-row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>You answered <b>{done}</b>.</span>
          <button className="j-btn j-btn-ghost" style={{ minHeight: 44 }} disabled={undoing} onClick={takeBack}>
            {undoing ? "Taking it back…" : "Change my answer"}
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="j-card" style={{ opacity: deferred ? 0.7 : 1 }} aria-label={item.question}>
      <div className="j-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {project}
        {item.kind === "unlock" && <span className="j-pill j-warn" style={{ fontSize: 12 }}>paused job</span>}
        <span className="j-muted" style={{ fontSize: 12 }}>
          {item.askedBy ? `${item.askedBy} · ` : ""}{ago(item.askedAt)}
          {deferred ? " · put off" : ""}
        </span>
        {hrefs.card && <Link href={hrefs.card} className="opx-link" style={{ fontSize: 12, marginLeft: "auto", textDecoration: "underline", textUnderlineOffset: 2 }}>Open the card</Link>}
      </div>

      <h2 style={{ fontSize: compact ? 15 : 16.5, fontWeight: 600, lineHeight: 1.4, margin: 0 }}><Linked text={item.question} /></h2>

      {item.context && (
        <div style={{ marginTop: 8 }}>
          <p className="j-muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
            <Linked text={longContext && !showContext ? `${item.context.slice(0, 220)}…` : item.context} />
          </p>
          {longContext && (
            <button type="button" className="opx-link opx-more" aria-expanded={showContext} onClick={() => setShowContext((v) => !v)}>
              {showContext ? "Less" : "More"}
            </button>
          )}
        </div>
      )}

      <QuestionPictures pictures={item.pictures} />

      {item.options.length > 0 && (
        <div className={compact ? "j-row" : "j-col"} style={{ gap: 8, marginTop: compact ? 10 : 14, flexWrap: "wrap" }}>
          {item.options.map((opt) => (
            <button
              key={opt}
              className="j-btn"
              disabled={busy}
              onClick={() => send({ option: opt }, opt)}
              style={{
                minHeight: compact ? 44 : 48, width: compact ? "auto" : "100%", justifyContent: "flex-start", textAlign: "left",
                padding: compact ? "8px 12px" : "12px 14px", fontSize: compact ? 13.5 : 14.5, whiteSpace: "normal", lineHeight: 1.35,
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
            className="j-reply"
            rows={3}
            placeholder={item.options.length ? "Say what you want instead…" : "Your answer…"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && item.options.length > 0) { e.stopPropagation(); setReplying(false) } }}
            autoFocus={item.options.length > 0}
          />
          <div className="j-row" style={{ gap: 8 }}>
            <button
              className="j-btn j-btn-primary"
              disabled={busy || !reply.trim()}
              onClick={() => send({ reply }, "reply")}
              style={{ minHeight: 44, flex: 1 }}
            >
              {sending === "reply" ? "Sending…" : "Send"}
            </button>
            {/* A way out of the reply box: it could be opened and never closed. Only where there are options to go back to. */}
            {item.options.length > 0 && (
              <button className="j-btn j-btn-ghost" disabled={busy} onClick={() => setReplying(false)} style={{ minHeight: 44 }}>
                Cancel reply
              </button>
            )}
          </div>
        </div>
      )}

      <div className="j-row" style={{ gap: 4, marginTop: 10 }}>
        {item.options.length > 0 && !replying && (
          <button className="j-btn j-btn-ghost" style={{ minHeight: 44 }} disabled={busy} onClick={() => setReplying(true)}>
            Reply instead
          </button>
        )}
        {!deferred && !compact && (
          <button className="j-btn j-btn-ghost" style={{ minHeight: 44, marginLeft: "auto" }} disabled={busy} onClick={onDefer}>
            Not now
          </button>
        )}
        {deferred && onBringBack && (
          <button className="j-btn j-btn-ghost" style={{ minHeight: 44, marginLeft: "auto" }} disabled={busy} onClick={onBringBack}>
            Bring back
          </button>
        )}
      </div>
    </article>
  )
}
