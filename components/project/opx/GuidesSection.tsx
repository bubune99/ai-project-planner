"use client"

/*
 * Stack and statements: what the owner's tools and taste ask of the work, and
 * the checks each one creates. Display and two switches only; the rules that
 * compile these into checks are in lib/gates/guides.ts.
 */

import { useState } from "react"
import type { Guide } from "@/lib/gates/guides"
import { useJson } from "./shared"

const SOURCE: Record<Guide["source"], string> = { owner: "From you", research: "From research", agent: "Suggested by an agent" }

export function GuidesSection() {
  const { data, error, reload } = useJson<{ guides: Guide[] }>("/api/gates/guides")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const guides = data?.guides ?? []

  async function post(body: unknown) {
    setBusy(true); setProblem(null)
    const res = await fetch("/api/gates/guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (!res.ok) setProblem((await res.json().catch(() => null))?.error ?? "Could not save that")
    setBusy(false); reload()
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
      {(["stack", "statement"] as const).map((kind) => group(kind).length > 0 && (
        <details key={kind} open={kind === "statement" && drafts > 0}>
          <summary>{kind === "stack" ? "Stack" : "Statements"} ({group(kind).length})</summary>
          <ul>
            {group(kind).map((g) => (
              <li key={g.id} className={g.status === "draft" ? "draft" : undefined}>
                <div className="opx-ck-ghead">
                  <b>{g.name}</b>
                  {g.status === "draft" && <span className="opx-muted">Draft</span>}
                  <button type="button" disabled={busy} onClick={() => post({ action: "status", id: g.id, status: g.status === "draft" ? "active" : "draft" })}>{g.status === "draft" ? "Make it a rule" : "Set aside"}</button>
                </div>
                <span>{g.summary}</span>
                <ol>{g.checks.map((c) => <li key={c.id}>{c.say}<small>{c.auto ? "Checked automatically" : "Checked by the agent, with what it saw"}</small></li>)}</ol>
                <span className="opx-muted">
                  Applies to {[g.applies.files?.join(", "), g.applies.imports?.length ? `files that use ${g.applies.imports.join(", ")}` : ""].filter(Boolean).join("; ")}.
                  {g.skill && ` How-to: the ${g.skill} skill.`} {SOURCE[g.source]}: {g.basis}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}
