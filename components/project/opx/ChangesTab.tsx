"use client"

/*
 * Changes tab: every change made to a screen, shown before and after with real
 * screenshots, what it answers and where it was proved. The owner says whether
 * each was a good change, with their thoughts; those are the lessons the next
 * change is made with. Display only: counts and wording come from
 * lib/gates/change-model.
 */

import { useState, useEffect, useRef } from "react"
import { ThumbsDown, ThumbsUp } from "lucide-react"
import { STAGE_WORD, type Lessons, type StoredChange } from "@/lib/gates/change-model"
import { Failed, Loading, Seg, ago, useJson } from "./shared"

type Shown = StoredChange & { before: string | null; after: string | null }
interface Data { changes: Shown[]; lessons: Lessons; line: string; canJudge: boolean }

export function ChangesTab({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useJson<Data>(`/api/projects/${projectId}/gates/changes`)
  const [show, setShow] = useState<"waiting" | "all" | "said">("waiting")
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<string | null>(null)
  /** The change whose "Not good" was pressed with nothing written: it is asked for there, in words anyone can see. */
  const [needWords, setNeedWords] = useState<string | null>(null)

  /** Picture links last an hour. A page left open longer shows blanks, so a picture that fails asks for fresh links, once per load. */
  const refetched = useRef(0)
  const onPictureError = () => { if (Date.now() - refetched.current > 60_000) { refetched.current = Date.now(); reload() } }
  /** "See before and after" in Waiting on you names one change: show the list it is in, bring it into view and mark it. */
  const [shownId, setShownId] = useState<string | null>(null)
  useEffect(() => {
    const go = () => {
      const id = (window as any).__opxShowChange as string | undefined
      if (!id || !data) return
      ;(window as any).__opxShowChange = undefined
      const c = data.changes.find((x) => x.id === id)
      if (!c) return
      setShow(c.verdict ? "all" : "waiting"); setShownId(id)
      window.setTimeout(() => { const el = document.getElementById(`change-${id}`); if (el) { el.scrollIntoView({ block: "start", behavior: "auto" }); el.focus({ preventScroll: true }) } }, 60)
    }
    go()
    window.addEventListener("opx:show-change", go)
    return () => window.removeEventListener("opx:show-change", go)
  }, [data])

  if (loading && !data) return <Loading what="the changes" />
  if (error && !data) return <Failed what="the changes" error={error} retry={reload} />
  if (!data) return null

  async function judge(id: string, verdict: "good" | "bad") {
    setFailed(null)
    const res = await fetch(`/api/projects/${projectId}/gates/changes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "judge", id, verdict, note: notes[id] ?? "" }) })
    const j = await res.json().catch(() => null)
    if (!res.ok) { setFailed(j?.error || "Could not save"); return }
    reload()
  }

  const l = data.lessons
  const list = show === "waiting" ? data.changes.filter((c) => !c.verdict) : data.changes
  return (
    <div className="opx-ch">
      <section className="opx-sec opx-ch-top">
        <Seg value={show} label="Which changes" options={[["waiting", `To look at (${l.waiting})`], ["all", `All (${data.changes.length})`], ["said", `What you said (${l.said.length})`]]} onChange={setShow} />
        <span className="opx-muted">{data.line}</span>
        {failed && <span className="opx-muted" role="alert">{failed}</span>}
      </section>

      {show === "said" ? (
        <section className="opx-sec">
          <h3 className="opx-pf-h">What you said about changes</h3>
          <span className="opx-muted">Agents read this before proposing a change of the same kind.</span>
          {l.said.length === 0 ? <p className="opx-muted">Nothing yet. Your thoughts on a change are kept here once you give them.</p> : (
            <ul className="opx-pf-log">{l.said.map((s, i) => <li key={i}><small>{ago(s.at)} · {s.verdict === "good" ? "good" : "not good"}</small><span><b>{s.title}.</b> {s.note}</span></li>)}</ul>
          )}
        </section>
      ) : list.length === 0 ? (
        <div className="opx-empty">{data.changes.length === 0 ? "No change has been recorded for this project yet. When an agent changes a screen, the before and after pictures appear here for you to judge." : "Nothing is waiting for you. Every recorded change has your answer."}</div>
      ) : list.map((c) => (
        <section className={`opx-sec opx-ch-card${shownId === c.id ? " shown" : ""}`} key={c.id} id={`change-${c.id}`} tabIndex={-1} aria-label={c.title}>
          <div className="opx-ch-head">
            <div><h3>{c.title}</h3><p className="opx-muted">{c.why}</p></div>
            <small className="opx-muted">{STAGE_WORD[c.stage]}{c.build ? ` · ${c.build}` : ""}{c.route ? ` · ${c.route}` : ""} · {ago(c.at)}</small>
          </div>
          <div className="opx-ch-pair">
            {([["Before", c.before], ["After", c.after]] as const).map(([label, src]) => (
              <figure key={label}>
                <figcaption>{label}</figcaption>
                {src ? <a href={src} target="_blank" rel="noreferrer" aria-label={`Open the ${label.toLowerCase()} picture at full size`}><img src={src} alt={`${label}: ${c.title}`} loading="lazy" onError={onPictureError} /></a> : <div className="opx-empty">The picture is not available.</div>}
              </figure>
            ))}
          </div>
          {c.verdict ? (
            <p className="opx-ch-said"><span className={`opx-pf-dot ${c.verdict === "good" ? "ok" : "bad"}`} /><b>You said: {c.verdict === "good" ? "a good change" : "not a good change"}.</b> {c.note}{data.canJudge && <button type="button" className="opx-pf-add" onClick={() => judge(c.id, c.verdict === "good" ? "bad" : "good")} disabled={c.verdict === "good" && !(notes[c.id] ?? "").trim()} title={c.verdict === "good" ? "Write what was wrong below first" : undefined}>Change my answer</button>}</p>
          ) : null}
          {data.canJudge && (
            <div className="opx-ch-judge">
              <input className="opx-input" aria-label={`Your thoughts on: ${c.title}`} placeholder={c.verdict ? "Add or change your thoughts" : "Your thoughts (needed if it was not a good change)"} value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} maxLength={600} />
              {!c.verdict && <>
                <button type="button" className="opx-btn" onClick={() => { setNeedWords(null); judge(c.id, "good") }}><ThumbsUp size={14} /> A good change</button>
                {/* Never disabled: a dimmed button with a hover tip told a phone nothing. Pressed with no words, it asks for them. */}
                <button type="button" className="opx-btn" onClick={(e) => {
                  if ((notes[c.id] ?? "").trim()) { setNeedWords(null); judge(c.id, "bad"); return }
                  setNeedWords(c.id)
                  ;(e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.focus()
                }}><ThumbsDown size={14} /> Not good</button>
              </>}
              {needWords === c.id && !(notes[c.id] ?? "").trim() && <p role="alert" className="opx-ch-need">Say what was wrong first, then press Not good.</p>}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
