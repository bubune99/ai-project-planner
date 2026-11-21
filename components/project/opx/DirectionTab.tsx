"use client"

/*
 * Direction tab: the owner sets, per kind of decision, whether the AI decides, decides and tells him, or asks him
 * first; sees what the AI would do by best practice for each; gives his own direction; and approves or redirects
 * the build decisions agents bring. Display only: the tree, the modes and every edit come from lib/direction.
 */

import { useEffect, useState } from "react"
import {
  KIND_BY_ID, MODE_LABEL, MODES, answer, setMode, setNote, tree, waitingCount,
  type DirectionDoc, type KindView, type Mode, type Upcoming,
} from "@/lib/direction/direction-model"
import { Failed, Loading, Section, ago } from "./shared"

interface LogEntry { version: number; actor: "owner" | "agent"; lines: string[]; at: string }
interface DirectionData { doc: DirectionDoc; version: number; log: LogEntry[]; canEdit: boolean }

export function DirectionTab({ projectId }: { projectId: string }) {
  const url = `/api/projects/${projectId}/direction`
  const [data, setData] = useState<DirectionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let off = false
    fetch(url).then(async (r) => {
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      return j as DirectionData
    }).then((j) => { if (!off) { setData(j); setError(null) } }).catch((e) => { if (!off) setError(e instanceof Error ? e.message : "Failed to load") })
    return () => { off = true }
  }, [url, tick])

  /** Every change is one pure edit of the document, saved whole with the version it started from. */
  const save = async (edit: (d: DirectionDoc) => DirectionDoc) => {
    if (!data || saving) return
    let next: DirectionDoc
    try { next = edit(data.doc) } catch (e) { setNotice(e instanceof Error ? e.message : "That change is not allowed"); return }
    setSaving(true); setNotice(null)
    try {
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: next, baseVersion: data.version }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setNotice(j?.error || `Could not save (HTTP ${r.status})`); if (r.status === 409) setTick((t) => t + 1); return }
      setData({ ...data, doc: j.doc, version: j.version, log: j.lines?.length ? [{ version: j.version, actor: j.actor, lines: j.lines, at: new Date().toISOString() }, ...data.log] : data.log })
    } catch { setNotice("Could not save: the planner did not answer. Try again.") } finally { setSaving(false) }
  }

  if (error) return <Failed what="the direction" error={error} retry={() => setTick((t) => t + 1)} />
  if (!data) return <Loading what="the direction" />

  const { doc, canEdit } = data
  const waiting = doc.upcoming.filter((u) => u.status === "waiting")
  const decided = doc.upcoming.filter((u) => u.status !== "waiting")
  const areas = tree(doc)

  return (
    <div className="opx-dir">
      <Section title="Waiting for you" count={waitingCount(doc)}>
        <p className="opx-muted opx-dir-lead">Build decisions an agent brought to you because you set that kind to ask first. Each shows the path the AI would take. Approve it, or redirect it with the way you want to go.</p>
        {waiting.length === 0 ? <p className="opx-dir-none">Nothing waits for you.</p> : (
          <ul className="opx-dir-list">{waiting.map((u) => <WaitingItem key={u.id} u={u} canEdit={canEdit} busy={saving} onAnswer={(approve, note) => save((d) => answer(d, u.id, { approve, note, at: new Date().toISOString() }))} />)}</ul>
        )}
        {notice && <p className="opx-dir-notice" role="status">{notice}</p>}
      </Section>

      <Section title="How each kind of decision is made" count={`${areas.reduce((n, a) => n + a.asks, 0)} ask you`}>
        <p className="opx-muted opx-dir-lead">The AI follows best practice on every decision. Choose which kinds it takes alone, which it takes and tells you about, and which pause that card until you answer. Your direction on a kind is a rule every agent follows. A fixed kind cannot be changed, and it says why.</p>
        {areas.map((a) => (
          <div key={a.area} className="opx-dir-area">
            <h3>{a.title}<span className="opx-muted">{a.asks ? ` · ${a.asks} ask${a.asks === 1 ? "s" : ""} you` : ""}</span></h3>
            <ul className="opx-dir-list">{a.kinds.map((k) => (
              <KindRow key={k.id} k={k} canEdit={canEdit} busy={saving}
                onMode={(m) => save((d) => setMode(d, k.id, m))}
                onNote={(n) => save((d) => setNote(d, k.id, n))} />
            ))}</ul>
          </div>
        ))}
      </Section>

      <Section title="Decided" count={decided.length}>
        {decided.length === 0 ? <p className="opx-dir-none">No build decisions recorded yet. Agents record each one they take on a kind set to tell you.</p> : (
          <ul className="opx-dir-list">{decided.slice(0, 30).map((u) => (
            <li key={u.id} className="opx-dir-item">
              <div className="opx-dir-head"><b>{u.title}</b><span className="opx-chip">{u.status === "taken" ? "AI decided" : u.status === "approved" ? "You approved" : "You redirected"}</span></div>
              <p><span className="opx-muted">AI would:</span> {u.aiPath}</p>
              {u.ownerNote && <p><span className="opx-muted">Your direction:</span> {u.ownerNote}</p>}
              <p className="opx-muted opx-dir-small">{KIND_BY_ID.get(u.kindId)?.title} · {ago(u.answeredAt || u.at)}</p>
            </li>
          ))}</ul>
        )}
      </Section>

      <Section title="Record of changes" count={data.log.length}>
        {data.log.length === 0 ? <p className="opx-dir-none">Nothing changed yet: every kind is on its best-practice default.</p> : (
          <ul className="opx-pf-log">{data.log.slice(0, 15).map((l) => (
            <li key={l.version}><span>{l.lines.join(". ")}</span><span className="opx-muted opx-dir-small">{l.actor === "owner" ? "You" : "An agent"} · {ago(l.at)}</span></li>
          ))}</ul>
        )}
      </Section>
    </div>
  )
}

function ModePick({ value, locked, disabled, onChange, label }: { value: Mode; locked: boolean; disabled: boolean; onChange: (m: Mode) => void; label: string }) {
  if (locked) return <span className="opx-chip">Fixed: {MODE_LABEL[value]}</span>
  return (
    <div className="opx-seg" role="radiogroup" aria-label={label}>
      {MODES.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={m === value} className={m === value ? "on" : ""} disabled={disabled} onClick={() => m !== value && onChange(m)}>{MODE_LABEL[m]}</button>
      ))}
    </div>
  )
}

function KindRow({ k, canEdit, busy, onMode, onNote }: { k: KindView; canEdit: boolean; busy: boolean; onMode: (m: Mode) => void; onNote: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(k.note ?? "")
  useEffect(() => { if (!editing) setText(k.note ?? "") }, [k.note, editing])
  const done = () => { onNote(text); setEditing(false) }
  return (
    <li className="opx-dir-item">
      <div className="opx-dir-head">
        <b>{k.title}</b>
        {k.changed && <span className="opx-chip">Changed from {MODE_LABEL[k.defaultMode]}</span>}
        <span className="opx-dir-mode"><ModePick value={k.mode} locked={!!k.locked || !canEdit} disabled={busy} onChange={onMode} label={`How "${k.title}" is decided`} /></span>
      </div>
      <p><span className="opx-muted">AI would:</span> {k.aiWould}</p>
      <p className="opx-muted opx-dir-small">{k.locked ? `Fixed. ${k.locked}` : k.why}</p>
      {editing ? (
        <div className="opx-dir-edit">
          <label className="opx-dir-small opx-muted" htmlFor={`dir-${k.id}`}>Your direction for this kind of decision</label>
          <textarea id={`dir-${k.id}`} className="opx-input" rows={2} value={text} autoFocus maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); setText(k.note ?? "") } }} />
          <div className="opx-row">
            <button type="button" className="opx-btn sm primary" disabled={busy} onClick={done}>Save direction</button>
            <button type="button" className="opx-btn sm" onClick={() => { setEditing(false); setText(k.note ?? "") }}>Cancel</button>
            {k.note && <button type="button" className="opx-btn sm danger" disabled={busy} onClick={() => { onNote(""); setEditing(false) }}>Remove direction</button>}
          </div>
        </div>
      ) : k.note ? (
        <p className="opx-dir-note"><span className="opx-muted">Your direction:</span> {k.note} {canEdit && <button type="button" className="opx-btn sm" onClick={() => setEditing(true)}>Change</button>}</p>
      ) : canEdit ? (
        <button type="button" className="opx-btn sm" onClick={() => setEditing(true)}>Add your direction</button>
      ) : null}
    </li>
  )
}

function WaitingItem({ u, canEdit, busy, onAnswer }: { u: Upcoming; canEdit: boolean; busy: boolean; onAnswer: (approve: boolean, note?: string) => void }) {
  const [redirecting, setRedirecting] = useState(false)
  const [text, setText] = useState("")
  return (
    <li className="opx-dir-item">
      <div className="opx-dir-head"><b>{u.title}</b><span className="opx-chip">{KIND_BY_ID.get(u.kindId)?.title}</span></div>
      <p><span className="opx-muted">AI would:</span> {u.aiPath}</p>
      {u.why && <p className="opx-muted opx-dir-small">{u.why}</p>}
      {u.alternatives.length > 0 && <p className="opx-dir-small"><span className="opx-muted">Other ways considered:</span> {u.alternatives.join("; ")}</p>}
      <p className="opx-muted opx-dir-small">Brought {ago(u.at)}</p>
      {canEdit && (redirecting ? (
        <div className="opx-dir-edit">
          <label className="opx-dir-small opx-muted" htmlFor={`redir-${u.id}`}>Which way should it go instead?</label>
          <textarea id={`redir-${u.id}`} className="opx-input" rows={2} value={text} autoFocus maxLength={1000}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRedirecting(false) }} />
          <div className="opx-row">
            <button type="button" className="opx-btn sm primary" disabled={busy || !text.trim()} onClick={() => onAnswer(false, text)}>Send redirect</button>
            <button type="button" className="opx-btn sm" onClick={() => setRedirecting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="opx-row">
          <button type="button" className="opx-btn sm primary" disabled={busy} onClick={() => onAnswer(true)}>Approve this path</button>
          <button type="button" className="opx-btn sm" disabled={busy} onClick={() => setRedirecting(true)}>Redirect</button>
        </div>
      ))}
    </li>
  )
}
