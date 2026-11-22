"use client"

/*
 * One checklist item of the Launch tab: its state in words, what it asks (the
 * catalog's claim, as written), its note and evidence, the owner's decisions
 * (pass, fail, waive with a reason, put back) and its history on demand.
 * Every write goes to POST /api/projects/[id]/readiness/validations/[itemId];
 * when the route refuses, its message is shown as written. Which decisions
 * are offered, and whether the last one can be put back, come from
 * lib/readiness/view.
 */

import { useEffect, useId, useRef, useState } from "react"
import type { Source, ValidationView } from "@/lib/readiness/model"
import { PROOF_WORD, STATE_TONE, STATE_WORD, historyLine, ownerActions, undoOf, type Decision, type HistoryRow } from "@/lib/readiness/view"
import { Failed, Loading, ago, fmtDate, unwrap, useJson } from "./shared"

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
const DO_WORD: Record<Decision, string> = { passed: "Mark passed", failed: "Mark failed", waived: "Waive…" }
const isWeb = (s: string) => /^https:\/\//.test(s)

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="opx-pf-box">
      <h4>Sources</h4>
      {sources.length === 0 ? <span className="opx-muted">The catalog names no source for this item.</span> : (
        <ul>
          {sources.map((s, i) => (
            <li key={i}>
              <span>{isWeb(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title} <small className="opx-muted">({s.quality})</small></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Asks why an item is waived. Closes by sending, by Cancel, by pressing outside it and by Esc. */
function WaiveDialog({ title, onClose, onSend }: { title: string; onClose: () => void; onSend: (reason: string) => Promise<string | null> }) {
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal() }, [])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!reason.trim()) { setFailed("Say why it is waived first."); return }
    setBusy(true); setFailed(null)
    const error = await onSend(reason.trim())
    setBusy(false)
    if (error) setFailed(error); else onClose()
  }

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-labelledby={`${id}-h`}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ padding: 0, border: "1px solid var(--opx-line)", borderRadius: 22, background: "var(--opx-card)", color: "var(--opx-ink)", width: "min(520px, calc(100vw - 32px))" }}
    >
      <form className="opx-dp" style={{ padding: 20 }} onSubmit={send}>
        <h3 id={`${id}-h`} className="opx-pf-h">Waive this item</h3>
        <p className="opx-ck-meta">{title}</p>
        <label htmlFor={`${id}-why`} className="opx-ck-meta">Why is it waived? The reason is kept with the item and in its history.</label>
        <textarea id={`${id}-why`} className="opx-input" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        {failed && <p role="alert" className="opx-ch-need">{failed}</p>}
        <div className="opx-row" style={{ flexWrap: "wrap" }}>
          <button type="submit" className="opx-btn primary" disabled={busy}>{busy ? "Saving the waiver…" : "Waive this item"}</button>
          <button type="button" className="opx-btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </dialog>
  )
}

export function LaunchItem({ projectId, v, recent, onChanged }: { projectId: string; v: ValidationView; recent: HistoryRow[]; onChanged: () => void }) {
  const id = useId()
  const url = `/api/projects/${projectId}/readiness/validations/${encodeURIComponent(v.item.id)}`
  const [open, setOpen] = useState(false)
  const [waiving, setWaiving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const hist = useJson(open ? url : null)
  const rows = hist.data ? (unwrap<HistoryRow[]>(hist.data) ?? []) : null
  // The item's full history once it is open; until then, its rows among the project's latest changes.
  const undo = undoOf(rows ?? recent)
  const legal = v.item.domain === "legal"

  /** Sends one decision. Answers with the route's own message when it refuses, or null when it is saved. */
  async function decide(state: Decision | "proposed", reason: string | null, key: string = state): Promise<string | null> {
    setBusy(key); setFailed(null); setSaid(null)
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reason ? { state, reason } : { state }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) return j?.error?.message || `Could not save (HTTP ${res.status})`
      const stored = (STATE_WORD as Record<string, string>)[j?.data?.state] ?? j?.data?.state ?? "–"
      setSaid(`Saved as ${stored}.${j?.data?.note ? ` ${j.data.note}` : ""}`)
      onChanged()
      if (open) hist.reload()
      return null
    } catch {
      return "Could not save: the planner did not answer. Try again."
    } finally {
      setBusy(null)
    }
  }
  const press = async (state: Decision | "proposed", reason: string | null, key?: string) => { const error = await decide(state, reason, key); if (error) setFailed(error) }

  const facts = [
    `Item ${v.item.id}`,
    PROOF_WORD[v.item.proof],
    v.decidedAt ? `${v.actorKind === "user" ? "Decided by the owner" : "Set by an agent"} on ${fmtDate(v.decidedAt, DAY) || "–"}` : null,
    v.dueAt && v.state !== "stale" ? `Re-check due ${fmtDate(v.dueAt, DAY) || "–"}` : null,
    v.item.cadence ? `Repeats ${v.item.cadence}` : null,
  ].filter(Boolean)
  const evidence = v.evidence.slice(-3).reverse()

  return (
    <li className="opx-dir-item">
      <div className="opx-dir-head">
        <span className="opx-chip"><i className={`opx-pf-dot ${STATE_TONE[v.state]}`} aria-hidden />{STATE_WORD[v.state]}</span>
        <b>{v.item.title}</b>
        <span className="opx-chip" aria-label={`Tier ${v.item.tier}`}>{v.item.tier}</span>
      </div>
      <p>{v.item.claim}</p>
      <p className="opx-muted opx-dir-small">{facts.join(" · ")}</p>
      {v.item.practice && <p className="opx-muted opx-dir-small">The catalog marks this as standard practice.</p>}
      {v.item.beyondResearch && <p className="opx-muted opx-dir-small">The catalog marks this as added beyond its research: verify it before relying on it.</p>}
      {v.reason && <p className="opx-dir-small"><b>Note:</b> {v.reason}</p>}
      {evidence.length > 0 && (
        <div className="opx-pf-box">
          <h4>Evidence{v.evidence.length > evidence.length ? ` (latest ${evidence.length} of ${v.evidence.length})` : ""}</h4>
          <ul>
            {evidence.map((e, i) => (
              <li key={i}>
                <span>{e.kind}: {e.summary}</span>
                {(e.ref || e.at) && (
                  <small className="opx-muted">
                    {e.ref && (isWeb(e.ref) ? <a href={e.ref} target="_blank" rel="noopener noreferrer">{e.ref}</a> : e.ref)}
                    {e.ref && e.at ? " · " : ""}{e.at ? fmtDate(e.at, DAY) : ""}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {legal && <Sources sources={v.item.sources} />}

      <div className="opx-row" style={{ flexWrap: "wrap", gap: 6 }}>
        {ownerActions(v.state).map((d) => (
          <button key={d} type="button" className="opx-btn sm" disabled={busy !== null} aria-label={`${DO_WORD[d]}: ${v.item.title}`} onClick={() => (d === "waived" ? setWaiving(true) : press(d, null))}>
            {busy === d ? "Saving…" : DO_WORD[d]}
          </button>
        ))}
        {undo.ok && (
          <button type="button" className="opx-btn sm" disabled={busy !== null} aria-label={`Put back to ${STATE_WORD[undo.state]}: ${v.item.title}`} onClick={() => press(undo.state, undo.reason, "back")}>
            {busy === "back" ? "Saving…" : `Put back to ${STATE_WORD[undo.state]}`}
          </button>
        )}
        <button type="button" className="opx-link" aria-expanded={open} aria-controls={`${id}-more`} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide history" : legal ? "History" : "History and sources"}
        </button>
      </div>
      {said && <p role="status" className="opx-muted opx-dir-small">{said}</p>}
      {failed && <p role="alert" className="opx-ch-need">{failed}</p>}

      {open && (
        <div id={`${id}-more`}>
          <div className="opx-pf-box">
            <h4>History</h4>
            {hist.error && !rows ? <Failed what="the history" error={hist.error} retry={hist.reload} />
              : !rows ? <Loading what="the history" />
              : rows.length === 0 ? <span className="opx-muted">No change has been recorded for this item.</span>
              : (
                <ul className="opx-pf-log">
                  {rows.map((h, i) => {
                    const line = historyLine(h)
                    return (
                      <li key={i}>
                        <small>{fmtDate(h.created_at, DAY) || "–"} · {ago(h.created_at)}</small>
                        <span><b>{line.who}.</b> {line.change}{line.override ? " · passed over a failing check" : ""}{h.reason ? ` · ${h.reason}` : ""}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            {rows && !undo.ok && <p className="opx-muted opx-dir-small">Putting back: {undo.why}</p>}
          </div>
          {!legal && <Sources sources={v.item.sources} />}
        </div>
      )}

      {waiving && <WaiveDialog title={v.item.title} onClose={() => setWaiving(false)} onSend={(reason) => decide("waived", reason)} />}
    </li>
  )
}
