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
import { KIND_WORD, findingKey, type StoredWalk } from "@/lib/walks/walk-model"
import { needsYou, needsYouLine, type CardRow, type WaitingChange } from "@/lib/project/needs-you"
import Link from "next/link"
import { QuestionCard } from "@/components/inbox/QuestionCard"
import { useJson } from "./shared"

const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--opx-muted)", margin: 0 }
const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "baseline", padding: "10px 0", borderTop: "1px solid var(--opx-line)" }

/** steps: the project's step list as the page already has it (cards only the owner can do are taken from it). */
export function useNeedsYou(projectId: string, steps?: unknown) {
  const inbox = useJson<any>("/api/inbox")
  const changes = useJson<{ changes: WaitingChange[] }>(`/api/projects/${projectId}/gates/changes`)
  const walks = useJson<{ walks: StoredWalk[] }>(`/api/projects/${projectId}/gates/walks`)
  const [answered, setAnswered] = useState<string[]>([])
  const value = useMemo(() => {
    const items: InboxItem[] = (Array.isArray(inbox.data) ? inbox.data : inbox.data?.data ?? []).filter((q: InboxItem) => !answered.includes(q.id))
    const s: any = steps
    const cards: CardRow[] = Array.isArray(s) ? s : Array.isArray(s?.steps) ? s.steps : Array.isArray(s?.data) ? s.data : Array.isArray(s?.data?.steps) ? s.data.steps : []
    return needsYou(projectId, { inbox: items, changes: changes.data?.changes ?? [], walks: walks.data?.walks ?? [], cards })
  }, [projectId, inbox.data, changes.data, walks.data, answered, steps])
  /** The owner's call on a finding that was theirs. Their own session only; the server refuses anyone else. */
  const settle = async (key: string, call: "do" | "leave" | null): Promise<string | null> => {
    const res = await fetch(`/api/projects/${projectId}/gates/walks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settle", key, call }) })
    const j = await res.json().catch(() => null)
    if (!res.ok) return j?.error || "Could not save that"
    walks.reload()
    return null
  }
  return { projectId, value, loading: inbox.loading || changes.loading || walks.loading, markAnswered: (id: string) => setAnswered((a) => [...a, id]), unmark: (id: string) => setAnswered((a) => a.filter((x) => x !== id)), reload: inbox.reload, settle }
}

export function NeedsYou({ state, onOpenTab }: { state: ReturnType<typeof useNeedsYou>; onOpenTab: (tab: string) => void }) {
  const { projectId, value: y, loading, markAnswered, unmark, settle } = state
  // Answered here: stays with what was chosen and Change my answer (walk 2026-11-16).
  const [just, setJust] = useState<{ item: InboxItem; answer: string }[]>([])
  const [allYours, setAllYours] = useState(false)
  /** The call just made, so it can be taken back from where it was made. */
  const [said, setSaid] = useState<{ key: string; what: string; call: "do" | "leave" } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  async function call(key: string, what: string, c: "do" | "leave" | null) {
    setBusy(key); setFailed(null)
    const err = await settle(key, c)
    setBusy(null)
    if (err) { setFailed(err); return }
    setSaid(c ? { key, what, call: c } : null)
  }
  const [open, setOpen] = useState(true)
  const [later, setLater] = useState<string[]>([])
  const [showAgents, setShowAgents] = useState(false)
  if (loading && y.count === 0 && y.agents.length === 0 && !said && just.length === 0) return null
  if (y.count === 0 && y.agents.length === 0 && y.walks.total === 0 && !said && just.length === 0) return null

  const questions = [...y.questions.filter((q) => !later.includes(q.id)), ...y.questions.filter((q) => later.includes(q.id))]
  return (
    <section aria-label="Waiting on you" data-testid="needs-you" className="opx-waiting" style={{ border: "1px solid var(--opx-line)", borderRadius: 18, padding: "14px 18px", margin: "0 0 14px" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}>
        {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <b style={{ fontSize: 15 }}>Waiting on you</b>
        <span data-testid="needs-you-line" style={{ fontSize: 13.5, color: "var(--opx-muted)" }}>{needsYouLine(y)}</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
          {(questions.length > 0 || just.length > 0) && (
            <div>
              <p style={label}>Questions</p>
              <div className="opx-qgrid">
                {just.map(({ item, answer }) => (
                  <QuestionCard key={item.id} item={item} hideProject deferred={false} answeredAs={answer} onDefer={() => {}}
                    onAnswered={() => {}} onUndone={() => { setJust((j) => j.filter((x) => x.item.id !== item.id)); unmark(item.id) }} />
                ))}
                {questions.map((q) => (
                  <QuestionCard key={q.id} item={q} hideProject deferred={later.includes(q.id)}
                    onDefer={() => setLater((d) => [...d.filter((x) => x !== q.id), q.id])}
                    onAnswered={(a) => { if (a !== undefined) setJust((j) => [{ item: q, answer: a }, ...j]); markAnswered(q.id) }} />
                ))}
              </div>
            </div>
          )}

          {y.cards.length > 0 && (
            <div>
              <p style={label}>Only you can do</p>
              {y.cards.map((c) => (
                <div key={c.id} className="opx-waiting-row" style={row}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{c.title}</span>
                  <Link className="opx-link" style={{ textDecoration: "underline" }} href={`/project/${projectId}?tab=tasks&step=${c.id}`} aria-label={`Open the card: ${c.title}`}>Open the card</Link>
                </div>
              ))}
            </div>
          )}

          {y.changes.length > 0 && (
            <div>
              <p style={label}>Changes to judge</p>
              {y.changes.slice(0, 5).map((c) => (
                <div key={c.id} className="opx-waiting-row" style={row}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{c.title}</span>
                  <button type="button" className="opx-link" aria-label={`See before and after: ${c.title}`} onClick={() => { (window as any).__opxShowChange = c.id; onOpenTab("changes"); window.dispatchEvent(new Event("opx:show-change")) }}>See before and after</button>
                </div>
              ))}
              {y.changes.length > 5 && <button type="button" className="opx-link" onClick={() => onOpenTab("changes")}>All {y.changes.length} in Changes</button>}
            </div>
          )}

          {(y.yours.length > 0 || said) && (
            <div>
              <p style={label}>Your call: it works, but is it how you want it</p>
              {said && (
                <p className="opx-waiting-said" role="status">
                  <span><b>{said.call === "do" ? "You said: change it." : "You said: leave it as it is."}</b> {said.what}{said.call === "do" ? " It is on the task list for agents." : ""}</span>
                  <button type="button" className="opx-link" disabled={busy === said.key} onClick={() => call(said.key, said.what, null)}>Undo</button>
                </p>
              )}
              {failed && <p role="alert" className="opx-ch-need">{failed}</p>}
              {(allYours ? y.yours : y.yours.slice(0, 3)).map((f) => {
                const key = findingKey(f)
                return (
                  <div key={key} className="opx-waiting-call">
                    <div>
                      <span style={{ fontSize: 14 }}>{f.what}</span>
                      <span style={{ fontSize: 12.5, color: "var(--opx-muted)" }}>
                        Met while trying to: {f.goal}{f.suggest ? `. Suggested: ${f.suggest}` : ""}
                      </span>
                    </div>
                    <div className="opx-waiting-acts">
                      <button type="button" className="opx-btn" disabled={busy === key} aria-label={`Change it: ${f.what}`} onClick={() => call(key, f.what, "do")}>Change it</button>
                      <button type="button" className="opx-btn" disabled={busy === key} aria-label={`Leave it as it is: ${f.what}`} onClick={() => call(key, f.what, "leave")}>Leave it as it is</button>
                    </div>
                  </div>
                )
              })}
              <div className="opx-waiting-foot">
                {y.yours.length > 3 && <button type="button" className="opx-link" aria-expanded={allYours} onClick={() => setAllYours((v) => !v)}>{allYours ? "Show the first 3" : `Show all ${y.yours.length}`}</button>}
                <button type="button" className="opx-link" onClick={() => onOpenTab("people")}>See the walks they came from</button>
              </div>
            </div>
          )}

          {(y.agents.length > 0 || y.walks.total > 0) && (
            <div className="opx-waiting-theirs">
              <p style={label}>Nothing for you to do here: what agents are fixing</p>
              <p className="opx-waiting-foot" style={{ fontSize: 14, margin: "6px 0 0" }}>
                <span data-testid="needs-you-agents">
                  Agents walked the product {y.walks.total} {y.walks.total === 1 ? "time" : "times"} ({y.walks.reached} reached the goal, {y.walks.stopped} stopped short) and have {y.agents.length} {y.agents.length === 1 ? "thing" : "things"} to fix.
                </span>
                {y.agents.length > 0 && <button type="button" className="opx-link" aria-expanded={showAgents} onClick={() => setShowAgents((v) => !v)}>{showAgents ? "Hide them" : "Show them"}</button>}
                <button type="button" className="opx-link" onClick={() => onOpenTab("people")}>Open the walks</button>
              </p>
              {showAgents && y.agents.map((f, i) => (
                <div key={i} style={{ ...row, flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{f.settled?.call === "do" ? "You said to change it" : KIND_WORD[f.kind]}:</b> {f.what}</span>
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
