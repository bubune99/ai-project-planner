"use client"

/**
 * ActivityFeed — the Overview "Recent activity" card.
 *
 * Reads /api/projects/[id]/feed, which unions work-order check-ins, todo
 * creations/completions, and legacy progress notes (newest first). Replaces
 * the old progress-notes-only feed that went stale once real work moved to
 * the work-order check-in loop.
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

export function ActivityFeed({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/feed?limit=20`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setItems(Array.isArray(j?.data) ? j.data : []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [projectId])

  return (
    <div className="j-card" style={{ padding: 0 }} data-testid="activity-feed">
      <div className="j-row j-between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--j-hairline)" }}>
        <h3 className="j-card-title">Recent activity</h3>
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
