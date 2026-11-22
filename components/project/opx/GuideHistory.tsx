"use client"

/*
 * Two dialogs for one stack entry or statement: its History (every kept version: who, when, what changed, read it,
 * restore it) and Trial or permanent. Display only: what a version changed, who may restore and what "due for
 * review" means are decided in lib/gates/guides.ts and enforced by the store.
 */

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { trialLabel, trialOf, type Guide, type GuideContent, type HistoryEntry } from "@/lib/gates/guides"
import { Failed, Loading, fmtDate, useJson } from "./shared"

type Entry = HistoryEntry & { content: GuideContent }
/** Sends one change; resolves to the reason it was refused, or null when it was saved. */
type Send = (body: Record<string, unknown>) => Promise<string | null>

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }

export function HistoryDialog({ guide, today, send, onClose }: { guide: Guide; today: string; send: Send; onClose: () => void }) {
  const { data, loading, error, reload } = useJson<{ versions: Entry[] }>(`/api/gates/guides?versions=${guide.id}`)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function restore(version: number) {
    setBusy(true); setProblem(null)
    const refused = await send({ action: "restore", id: guide.id, version })
    setBusy(false)
    if (refused) setProblem(refused); else onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History: {guide.name}</DialogTitle>
          <DialogDescription>Every saved version is kept. Restoring one saves it again as the newest version; nothing is removed.</DialogDescription>
        </DialogHeader>
        {problem && <p role="alert">{problem}</p>}
        {error ? <Failed what="the history" error={error} retry={reload} />
          : loading || !data ? <Loading what="the history" />
          : data.versions.length === 0 ? <div className="opx-empty">No versions kept yet. This one has not been saved since history started; its next save keeps it as it stands now.</div>
          : data.versions.map((v) => (
            <div key={v.version} className="grid gap-1.5">
              <div className="opx-row flex-wrap">
                <b>Version {v.version}</b>
                {v.current && <span className="opx-chip">Current</span>}
                <span className="opx-muted">{v.who}, {fmtDate(v.at, WHEN) || "–"}</span>
              </div>
              <span>{v.changes.join(". ")}.</span>
              <details>
                <summary className="opx-muted">Read version {v.version}</summary>
                <div className="grid gap-1.5">
                  <span>{v.content.summary}</span>
                  <ol className="list-decimal pl-5">{v.content.checks.map((c) => <li key={c.id}>{c.say}</li>)}</ol>
                  <span className="opx-muted">
                    {v.content.status === "draft" ? "Draft" : v.content.kind === "statement" ? trialLabel(v.content, today) : "In use"}.
                    {" "}Applies to {[v.content.applies.files?.join(", "), v.content.applies.imports?.length ? `files that use ${v.content.applies.imports.join(", ")}` : ""].filter(Boolean).join("; ")}.
                    {" "}{v.content.basis}
                  </span>
                </div>
              </details>
              {!v.current && (
                <div className="opx-row">
                  <button type="button" className="opx-btn sm" disabled={busy} aria-label={`Restore version ${v.version} of ${guide.name}`} onClick={() => restore(v.version)}>Restore this version</button>
                </div>
              )}
            </div>
          ))}
      </DialogContent>
    </Dialog>
  )
}

export function TrialDialog({ guide, today, send, onClose }: { guide: Guide; today: string; send: Send; onClose: () => void }) {
  const trial = trialOf(guide, today)
  const [until, setUntil] = useState(trial.state === "trial" ? trial.until : "")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function set(value: string | null) {
    setBusy(true); setProblem(null)
    const refused = await send({ action: "trial", id: guide.id, until: value, today })
    setBusy(false)
    if (refused) setProblem(refused); else onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trial or permanent: {guide.name}</DialogTitle>
          <DialogDescription>Now: {trialLabel(guide, today)}. It is enforced the same either way; a trial is marked, and shows as due for review once its date has passed.</DialogDescription>
        </DialogHeader>
        {problem && <p role="alert">{problem}</p>}
        <label className="grid gap-1.5" htmlFor={`trial-${guide.id}`}>
          <span className="opx-muted">Review date</span>
          <input id={`trial-${guide.id}`} type="date" className="opx-input" min={today} value={until} disabled={busy} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="opx-row flex-wrap">
          <button type="button" className="opx-btn primary" disabled={busy || !until || (trial.state === "trial" && trial.until === until)} onClick={() => set(until)}>
            {trial.state === "trial" ? "Move the review date" : "Put on trial until this date"}
          </button>
          <button type="button" className="opx-btn" disabled={busy || trial.state === "permanent"} onClick={() => set(null)}>Make permanent</button>
          <button type="button" className="opx-btn" onClick={onClose}>Cancel</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
