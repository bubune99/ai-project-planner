"use client"

/*
 * Stack and statements: what the owner's tools and taste ask of the work, and
 * the checks each one creates. Display and switches only; the rules that
 * compile these into checks, and decide trial, due for review and history,
 * are in lib/gates/guides.ts. The two dialogs are in GuideHistory.tsx.
 */

import { useState } from "react"
import { trialLabel, trialOf, type Guide, type TrialState } from "@/lib/gates/guides"
import type { Ledger } from "@/lib/gates/guide-ledger"
import { HistoryDialog, TrialDialog } from "./GuideHistory"
import { LedgerLines } from "./GuideLedger"
import { Failed, useJson } from "./shared"

const SOURCE: Record<Guide["source"], string> = { owner: "From you", research: "From research", agent: "Suggested by an agent" }

/** The day it is for the person looking, as YYYY-MM-DD. Read here and passed to the rules, which have no clock. */
function localDay(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const isDue = (t: TrialState) => t.state === "trial" && t.due

export function GuidesSection() {
  const { data, error, reload } = useJson<{ guides: Guide[] }>("/api/gates/guides")
  /** Each statement's numbers. Loaded beside the list, so the list still shows when these do not. */
  const ledger = useJson<{ checkResultsKept: boolean; ledgers: Record<string, Ledger> }>("/api/gates/guides?ledger=1")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** Which lists the person has opened or closed by hand. Until they touch one, Statements opens itself when a draft waits. */
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  /** The dialog that is open, and for which guide. */
  const [dialog, setDialog] = useState<{ kind: "history" | "trial"; id: string } | null>(null)
  const guides = data?.guides ?? []
  const today = localDay()

  /** Sends one change and reloads the list. Resolves to why it was refused, or null. */
  async function send(body: unknown): Promise<string | null> {
    try {
      const res = await fetch("/api/gates/guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) return null
      return (await res.json().catch(() => null))?.error ?? "Could not save that"
    } catch {
      return "Could not reach the planner. Nothing was saved."
    } finally {
      reload(); ledger.reload()
    }
  }

  async function post(body: unknown) {
    setBusy(true); setProblem(null)
    setProblem(await send(body))
    setBusy(false)
  }

  if (error) return <section className="opx-sec opx-ck-guides"><p className="opx-muted">The stack and statements could not be loaded: {error}</p></section>
  if (!data) return null
  const group = (kind: Guide["kind"]) => guides.filter((g) => g.kind === kind)
  const drafts = guides.filter((g) => g.status === "draft").length

  return (
    <section className="opx-sec opx-ck-guides">
      <h3 className="opx-ck-h3">Stack and statements</h3>
      <p className="opx-muted">
        What your tools and your taste ask of the work. Each one names the files it applies to and the checks it creates; an agent owes those checks on every file it writes that matches.
        {drafts > 0 && ` ${drafts} draft${drafts === 1 ? "" : "s"} waiting for you to settle: drafts hold nobody up.`}
      </p>
      {guides.length === 0 && (
        <p>
          <button type="button" className="opx-ck-add" disabled={busy} onClick={() => post({ action: "install-defaults" })}>Add the starting set</button>
          <span className="opx-muted"> The stack you named, and the preferences you have already given, as a structure to adjust.</span>
        </p>
      )}
      {problem && <p className="opx-ck-note">{problem}</p>}
      {ledger.error && <Failed what="the statements' numbers" error={ledger.error} retry={ledger.reload} />}
      {ledger.data?.checkResultsKept === false && (
        <p className="opx-muted">Each check's result is kept in the project's own folder and is not sent to the planner yet, so no statement has check numbers to show.</p>
      )}
      {(["stack", "statement"] as const).map((kind) => group(kind).length > 0 && (
        // Once touched, a list stays as the person left it. Before this, turning the last draft into a rule shut the
        // Statements list under the person's hand, because "open" followed the number of drafts.
        <details key={kind} open={opened[kind] ?? (kind === "statement" && drafts > 0)} onToggle={(e) => { const now = e.currentTarget.open; setOpened((o) => (o[kind] === now ? o : { ...o, [kind]: now })) }}>
          <summary>{kind === "stack" ? "Stack" : "Statements"} ({group(kind).length})</summary>
          <ul>
            {group(kind).map((g) => (
              <li key={g.id} className={g.status === "draft" ? "draft" : undefined}>
                <div className="opx-ck-ghead">
                  <b>{g.name}</b>
                  {g.status === "draft" && <span className="opx-muted">Draft</span>}
                  <button type="button" disabled={busy} aria-label={`${g.status === "draft" ? "Make it a rule" : "Set aside"}: ${g.name}`} onClick={() => post({ action: "status", id: g.id, status: g.status === "draft" ? "active" : "draft" })}>{g.status === "draft" ? "Make it a rule" : "Set aside"}</button>
                </div>
                {g.kind === "statement" && g.status === "active" && (isDue(trialOf(g, today))
                  ? <b>{trialLabel(g, today)}</b>
                  : <span className="opx-muted">{trialLabel(g, today)}</span>)}
                <span>{g.summary}</span>
                {g.kind === "statement" && <LedgerLines ledger={ledger.data?.ledgers[g.id]} loading={ledger.loading} onTrial={g.status === "active" && trialOf(g, today).state === "trial"} />}
                <ol>{g.checks.map((c) => <li key={c.id}>{c.say}<small>{c.auto ? "Checked automatically" : "Checked by the agent, with what it saw"}</small></li>)}</ol>
                <span className="opx-muted">
                  Applies to {[g.applies.files?.join(", "), g.applies.imports?.length ? `files that use ${g.applies.imports.join(", ")}` : ""].filter(Boolean).join("; ")}.
                  {g.skill && ` How-to: the ${g.skill} skill.`} {SOURCE[g.source]}: {g.basis}
                </span>
                <div className="opx-row">
                  <button type="button" className="opx-btn sm" aria-label={`History: ${g.name}`} onClick={() => setDialog({ kind: "history", id: g.id })}>History</button>
                  {g.kind === "statement" && g.status === "active" && (
                    <button type="button" className="opx-btn sm" aria-label={`Trial or permanent: ${g.name}`} onClick={() => setDialog({ kind: "trial", id: g.id })}>Trial or permanent</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {(() => {
        const g = dialog && guides.find((x) => x.id === dialog.id)
        if (!dialog || !g) return null
        const close = () => setDialog(null)
        return dialog.kind === "history" ? <HistoryDialog guide={g} today={today} send={send} onClose={close} /> : <TrialDialog guide={g} today={today} send={send} onClose={close} />
      })()}
    </section>
  )
}
