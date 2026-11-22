"use client"

/*
 * Removing a stack entry or statement, and putting one back: the confirmation, the notice with Undo that follows a
 * removal, and the list of removed ones. Display only: what the confirmation says, who may remove and what "put
 * back" restores are decided in lib/gates/guides.ts and enforced by the store.
 */

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DEFAULT_GUIDES } from "@/lib/gates/default-guides"
import { removalWords, type Guide } from "@/lib/gates/guides"
import { Failed, fmtDate } from "./shared"

/** Sends one change; resolves to the reason it was refused, or null when it was saved. */
type Send = (body: Record<string, unknown>) => Promise<string | null>
export type Removed = Pick<Guide, "id" | "kind" | "name" | "summary" | "status"> & { removedAt: string }

const STARTING_SET = DEFAULT_GUIDES.map((g) => g.name)
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }

export function RemoveDialog({ guide, send, onRemoved, onClose }: { guide: Guide; send: Send; onRemoved: (g: Guide) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const words = removalWords(guide, STARTING_SET)

  async function remove() {
    setBusy(true); setProblem(null)
    const refused = await send({ action: "remove", id: guide.id })
    setBusy(false)
    if (refused) setProblem(refused); else { onRemoved(guide); onClose() }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{words.title}</DialogTitle>
          <DialogDescription>{words.lines[0]}</DialogDescription>
        </DialogHeader>
        {words.lines.slice(1).map((line) => <p key={line} className="opx-muted">{line}</p>)}
        {problem && <p role="alert">{problem}</p>}
        <div className="opx-row flex-wrap">
          <button type="button" className="opx-btn primary" disabled={busy} onClick={remove}>{words.confirm}</button>
          <button type="button" className="opx-btn" onClick={onClose}>Cancel</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Shown after a removal, until it is dismissed or the next change is sent. */
export function RemovedNotice({ name, busy, onUndo, onDismiss }: { name: string; busy: boolean; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="opx-row flex-wrap">
      <span>{`Removed "${name}". Its rules are no longer handed out.`}</span>
      <button type="button" className="opx-btn sm" disabled={busy} aria-label={`Undo: put "${name}" back`} onClick={onUndo}>Undo</button>
      <button type="button" className="opx-btn sm" aria-label="Dismiss this notice" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

/** The removed ones, each with a way back. Nothing is drawn while there are none. */
export function RemovedList({ removed, error, retry, busy, onPutBack }: { removed: Removed[] | undefined; error: string | null; retry: () => void; busy: boolean; onPutBack: (g: Removed) => void }) {
  if (error) return <Failed what="the removed ones" error={error} retry={retry} />
  if (!removed?.length) return null
  return (
    <details>
      <summary>Removed ({removed.length})</summary>
      <ul>
        {removed.map((g) => (
          <li key={g.id}>
            <div className="opx-ck-ghead">
              <b>{g.name}</b>
              <button type="button" disabled={busy} aria-label={`Put back: ${g.name}`} onClick={() => onPutBack(g)}>Put back</button>
            </div>
            <span className="opx-muted">{g.kind === "stack" ? "Stack entry" : "Statement"}, removed {fmtDate(g.removedAt, DAY) || "–"}. Put back, it is {g.status === "draft" ? "a draft" : "a rule"} again, as it was.</span>
            <span>{g.summary}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
