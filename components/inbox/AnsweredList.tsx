"use client"

/**
 * "Answered" on the inbox: what the owner answered and where each answer went, newest first.
 *
 * An answer used to vanish the moment it was given. On 2026-11-14 he answered 17 questions and 10 reached no
 * agent, with nothing on screen to show it. Each row now says: not picked up yet, picked up by <agent>, or
 * finished with what was done. The states and wording are from lib/queue/item-state.ts.
 */
import { useCallback, useEffect, useState } from "react"

interface Answered {
  questionId: string; question: string; answer: string | null; answeredAt: string | null
  state: "unclaimed" | "claimed" | "done" | "waiting" | "set-aside"; projectName: string | null; where: string; canUndo?: boolean
}

export function AnsweredList({ refreshKey, onTakenBack }: { refreshKey?: number; /** Called after an answer is taken back, so the question can be shown waiting again. */ onTakenBack?: () => void }) {
  const [undoing, setUndoing] = useState<string | null>(null)
  const [undoError, setUndoError] = useState<{ id: string; why: string } | null>(null)
  const [items, setItems] = useState<Answered[] | null>(null)
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/answered${all ? "?all=1" : ""}`, { credentials: "include", cache: "no-store" })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error?.message || `HTTP ${res.status}`)
      setItems(j.data as Answered[]); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load") }
  }, [all])
  useEffect(() => { load() }, [load, refreshKey])

  const takeBack = async (id: string) => {
    setUndoing(id); setUndoError(null)
    try {
      const res = await fetch(`/api/inbox/${id}`, { method: "DELETE", credentials: "include" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message || `Could not take it back (${res.status})`)
      await load(); onTakenBack?.()
    } catch (e) { setUndoError({ id, why: e instanceof Error ? e.message : "Could not take it back" }); await load() }
    setUndoing(null)
  }

  if (error) return <p className="j-muted" role="alert" style={{ fontSize: 13 }}>Couldn&apos;t load what you answered: {error}</p>
  if (!items) return null
  const waiting = items.filter((i) => i.state === "unclaimed").length
  if (!items.length && !all) return (
    <p className="j-muted" style={{ fontSize: 13, margin: "4px 2px" }}>
      Every answer you gave has been picked up and finished. <button className="opx-link" style={{ textDecoration: "underline", minHeight: 44 }} onClick={() => setAll(true)}>Show finished ones</button>
    </p>
  )

  return (
    <section data-testid="answered-list" aria-label="What you answered" className="j-col" style={{ gap: 8 }}>
      <div className="j-row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Answered{waiting ? `: ${waiting} not picked up yet` : ""}
        </h2>
        <button className="opx-link" style={{ textDecoration: "underline", minHeight: 44 }} onClick={() => setAll((v) => !v)}>{all ? "Hide finished" : "Show finished"}</button>
      </div>
      {items.map((i) => (
        <article key={i.questionId} className="j-card" data-state={i.state} style={{ padding: 14 }}>
          {i.projectName && <p className="j-muted" style={{ margin: "0 0 4px", fontSize: 12.5 }}>{i.projectName}</p>}
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" }}>{i.question}</p>
          <p style={{ margin: "6px 0 0", fontSize: 14, overflowWrap: "anywhere" }}><span className="j-muted">You said: </span>{i.answer ?? "(no text)"}</p>
          <p data-testid="answer-where" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: i.state === "unclaimed" ? 600 : 400 }} className={i.state === "unclaimed" ? undefined : "j-muted"}>{i.where}</p>
          {i.canUndo && (
            <button type="button" className="j-btn j-btn-ghost" data-testid="answer-undo" style={{ minHeight: 44, marginTop: 8 }} disabled={undoing !== null} onClick={() => takeBack(i.questionId)}>
              {undoing === i.questionId ? "Taking it back" : "Change my answer"}
            </button>
          )}
          {undoError?.id === i.questionId && <p role="alert" className="j-neg" style={{ margin: "6px 0 0", fontSize: 13 }}>{undoError.why}</p>}
        </article>
      ))}
    </section>
  )
}
