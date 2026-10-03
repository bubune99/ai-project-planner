"use client"

/**
 * ActivityFeed — the Overview "Recent activity" card.
 *
 * Reads /api/projects/[id]/feed, which unions work-order check-ins, todo
 * creations/completions, and legacy progress notes (newest first). Replaces
 * the old progress-notes-only feed that went stale once real work moved to
 * the work-order check-in loop.
 *
 * It also carries the note composer. Notes had their own project tab — a
 * second chronological stream beside this one, over a table this feed already
 * reads. Posting here lands the note in the same list as everything else.
 */

import { useEffect, useState } from "react"

interface FeedItem {
  id: string
  source: "checkin" | "todo" | "note"
  kind: string
  title: string
  detail?: string | null
  actor?: string | null
  actor_type?: string | null
  context?: string | null
  ref_type?: string | null
  ref_id?: string | null
  ts: string
}

const KIND_TONE: Record<string, string> = {
  // check-in events
  claim: "j-info", progress: "j-proj", blocker: "j-warn",
  protocol_violation: "j-neg", retry: "j-warn", completion: "j-pos",
  failure: "j-neg", release: "j-muted",
  // todo events
  created: "j-info", completed: "j-pos",
  // note types
  decision: "j-proj", question: "j-warn",
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

const SOURCE_LABEL: Record<string, string> = {
  checkin: "agent", todo: "todo", note: "note",
}

const NOTE_TYPES = ["note", "progress", "decision", "blocker"] as const

export function ActivityFeed({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [reload, setReload] = useState(0)
  const [draft, setDraft] = useState("")
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]>("note")
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const post = async () => {
    const content = draft.trim()
    if (!content) return
    setPosting(true); setErr(null)
    try {
      const res = await fetch("/api/progress-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, author_type: "human", author_name: "You", note_type: noteType, content }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error?.message || j?.error || `HTTP ${res.status}`)
      }
      setDraft(""); setNoteType("note"); setReload(r => r + 1)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to post note")
    } finally {
      setPosting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/feed?limit=20`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setItems(Array.isArray(j?.data) ? j.data : []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [projectId, reload])

  return (
    <div className="j-card" style={{ padding: 0 }} data-testid="activity-feed">
      <div className="j-row j-between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)" }}>
        <h3 className="j-card-title">Recent activity</h3>
      </div>

      <div className="j-col" style={{ gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)" }}>
        <textarea
          aria-label="Post a note"
          className="j-search"
          rows={2}
          placeholder="Post a note — progress, a decision, a blocker…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post() }}
          style={{ resize: "vertical", height: "auto", padding: 10 }}
        />
        {draft.trim() && (
          <div className="j-row" style={{ gap: 8, alignItems: "center" }}>
            <select aria-label="Note type" className="j-search" style={{ width: "auto" }} value={noteType}
              onChange={(e) => setNoteType(e.target.value as (typeof NOTE_TYPES)[number])}>
              {NOTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="j-btn j-btn-primary" disabled={posting} onClick={post}>{posting ? "Posting…" : "Post"}</button>
            {err && <span className="j-neg" style={{ fontSize: 12 }} role="alert">{err}</span>}
          </div>
        )}
      </div>

      {items === null ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <span className="j-muted" style={{ fontSize: 12 }}>Loading activity…</span>
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <p className="j-muted" style={{ fontSize: 13, margin: 0 }}>No activity yet.</p>
        </div>
      ) : (
        items.map((it) => (
          <div
            key={it.id}
            data-testid="activity-item"
            className="j-row"
            style={{ gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)", alignItems: "flex-start" }}
          >
            <span className={`j-pill ${KIND_TONE[it.kind] || "j-ghost"}`} style={{ fontSize: 10, marginTop: 1, flexShrink: 0 }}>
              {it.kind.replace("_", " ")}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title || "Update"}</div>
              {it.detail && (
                <div className="j-muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                  {typeof it.detail === "string" ? it.detail.slice(0, 140) : ""}
                </div>
              )}
              <div className="j-muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                {SOURCE_LABEL[it.source] || it.source}
                {it.actor ? ` · ${it.actor}` : ""}
                {it.context ? ` · ${it.context}` : ""}
              </div>
            </div>
            <span className="j-muted" style={{ fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
              {relTime(it.ts)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
