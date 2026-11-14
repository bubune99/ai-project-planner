"use client"

/*
 * "Waiting on you", at the top of a project: the questions agents asked about
 * this project (answerable here), the changes not yet judged, and what walks
 * left that is the owner's call. What walks found that agents must fix is
 * listed too, as theirs. Rules: lib/project/needs-you.ts.
 */

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { InboxItem } from "@/lib/inbox"
import { KIND_WORD, type StoredWalk } from "@/lib/walks/walk-model"
import { needsYou, needsYouLine, type WaitingChange } from "@/lib/project/needs-you"
import { QuestionCard } from "@/components/inbox/QuestionCard"
import { useJson } from "./shared"

const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--opx-muted)", margin: 0 }
const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderTop: "1px solid var(--opx-line)" }

export function useNeedsYou(projectId: string) {
  const inbox = useJson<any>("/api/inbox")
  const changes = useJson<{ changes: WaitingChange[] }>(`/api/projects/${projectId}/gates/changes`)
  const walks = useJson<{ walks: StoredWalk[] }>(`/api/projects/${projectId}/gates/walks`)
  const [answered, setAnswered] = useState<string[]>([])
  const value = useMemo(() => {
    const items: InboxItem[] = (Array.isArray(inbox.data) ? inbox.data : inbox.data?.data ?? []).filter((q: InboxItem) => !answered.includes(q.id))
    return needsYou(projectId, { inbox: items, changes: changes.data?.changes ?? [], walks: walks.data?.walks ?? [] })
  }, [projectId, inbox.data, changes.data, walks.data, answered])
  return { value, loading: inbox.loading || changes.loading || walks.loading, markAnswered: (id: string) => setAnswered((a) => [...a, id]) }
}

export function NeedsYou({ state, onOpenTab }: { state: ReturnType<typeof useNeedsYou>; onOpenTab: (tab: string) => void }) {
  const { value: y, loading, markAnswered } = state
  const [open, setOpen] = useState(true)
  const [later, setLater] = useState<string[]>([])
  const [showAgents, setShowAgents] = useState(false)
  if (loading && y.count === 0 && y.agents.length === 0) return null
  if (y.count === 0 && y.agents.length === 0 && y.walks.total === 0) return null

  const questions = [...y.questions.filter((q) => !later.includes(q.id)), ...y.questions.filter((q) => later.includes(q.id))]
  return (
    <section aria-label="Waiting on you" data-testid="needs-you" style={{ border: "1px solid var(--opx-line)", borderRadius: 18, padding: "14px 18px", margin: "0 0 14px" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}>
        {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <b style={{ fontSize: 15 }}>Waiting on you</b>
        <span data-testid="needs-you-line" style={{ fontSize: 13.5, color: "var(--opx-muted)" }}>{needsYouLine(y)}</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
          {questions.length > 0 && (
            <div>
              <p style={label}>Questions</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 400px), 1fr))", gap: 12, marginTop: 8, alignItems: "start" }}>
                {questions.map((q) => (
                  <QuestionCard key={q.id} item={q} hideProject deferred={later.includes(q.id)}
                    onDefer={() => setLater((d) => [...d.filter((x) => x !== q.id), q.id])} onAnswered={() => markAnswered(q.id)} />
                ))}
              </div>
            </div>
          )}

          {y.changes.length > 0 && (
            <div>
              <p style={label}>Changes to judge</p>
              {y.changes.slice(0, 5).map((c) => (
                <div key={c.id} style={row}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{c.title}</span>
                  <button type="button" className="opx-link" onClick={() => onOpenTab("changes")}>See before and after</button>
                </div>
              ))}
              {y.changes.length > 5 && <button type="button" className="opx-link" onClick={() => onOpenTab("changes")}>All {y.changes.length} in Changes</button>}
            </div>
          )}

          {y.yours.length > 0 && (
            <div>
              <p style={label}>Your call: it works, but is it how you want it</p>
              {y.yours.map((f, i) => (
                <div key={i} style={{ ...row, flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{f.what}</span>
                  <span style={{ fontSize: 12.5, color: "var(--opx-muted)" }}>
                    Met while trying to: {f.goal}{f.suggest ? `. Suggested: ${f.suggest}` : ""}
                  </span>
                </div>
              ))}
              <button type="button" className="opx-link" onClick={() => onOpenTab("people")}>See the walks in People and flows</button>
            </div>
          )}

          {(y.agents.length > 0 || y.walks.total > 0) && (
            <div>
              <p style={label}>Not yours: found by walking the product, for agents to fix</p>
              <div style={row}>
                <span style={{ flex: 1, fontSize: 14 }} data-testid="needs-you-agents">
                  {y.walks.total} {y.walks.total === 1 ? "walk" : "walks"}, {y.walks.reached} reached the goal, {y.walks.stopped} stopped short. {y.agents.length} {y.agents.length === 1 ? "thing" : "things"} to fix.
                </span>
                {y.agents.length > 0 && <button type="button" className="opx-link" aria-expanded={showAgents} onClick={() => setShowAgents((v) => !v)}>{showAgents ? "Hide" : "Show them"}</button>}
                <button type="button" className="opx-link" onClick={() => onOpenTab("people")}>Open the walks</button>
              </div>
              {showAgents && y.agents.map((f, i) => (
                <div key={i} style={{ ...row, flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{KIND_WORD[f.kind]}:</b> {f.what}</span>
                  <span style={{ fontSize: 12.5, color: "var(--opx-muted)" }}>Met while trying to: {f.goal}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
