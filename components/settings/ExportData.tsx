"use client"
/**
 * Settings → Data & Export: "Download my data".
 *
 * Draws only. What is in the file and what is left out come from lib/settings/export-model.ts, so the page
 * and the file cannot say different things. The file is made by GET /api/settings/export.
 */
import { useState } from "react"
import { Download } from "lucide-react"
import { NOT_INCLUDED, exportSummary } from "@/lib/settings/export-model"

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "failed"; why: string }
  | { kind: "done"; name: string; rows: number | null; complete: boolean }

const SUMMARY = exportSummary()

function fileNameFrom(header: string | null): string {
  const m = header ? /filename="([^"]+)"/.exec(header) : null
  return m ? m[1] : "planner-export.json"
}

export function ExportData() {
  const [state, setState] = useState<State>({ kind: "idle" })

  const download = async () => {
    setState({ kind: "working" })
    try {
      const res = await fetch("/api/settings/export", { credentials: "include", cache: "no-store" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message || `The file could not be made (${res.status}).`)
      }
      const name = fileNameFrom(res.headers.get("Content-Disposition"))
      const rowsHeader = res.headers.get("X-Export-Rows")
      const rows = rowsHeader !== null && /^\d+$/.test(rowsHeader) ? Number(rowsHeader) : null
      const complete = res.headers.get("X-Export-Complete") === "true"
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setState({ kind: "done", name, rows, complete })
    } catch (e) {
      setState({ kind: "failed", why: e instanceof Error && e.message ? e.message : "The file could not be made." })
    }
  }

  const working = state.kind === "working"

  return (
    <div className="j-col" style={{ gap: 14 }}>
      <div className="j-row j-between j-wrap" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Export my data</div>
          <div className="j-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            One JSON file of what this account owns, saved to this device. Nothing is sent anywhere else.
          </div>
        </div>
        <button type="button" className="opx-btn primary" onClick={download} disabled={working} aria-busy={working} style={{ flexShrink: 0 }}>
          <Download size={15} strokeWidth={1.8} aria-hidden="true" />
          {working ? "Preparing your file…" : "Download my data"}
        </button>
      </div>

      <div aria-live="polite">
        {state.kind === "failed" && (
          <div className="j-row j-wrap" role="alert" style={{ gap: 10 }}>
            <p className="opx-ch-need" style={{ margin: 0, flexBasis: "auto" }}>{state.why}</p>
            <button type="button" className="opx-btn sm" onClick={download}>Try again</button>
          </div>
        )}
        {state.kind === "done" && (
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Saved {state.name}{state.rows !== null ? ` (${state.rows.toLocaleString("en-US")} ${state.rows === 1 ? "item" : "items"})` : ""}.
            {!state.complete && " Some lists were cut at their limit or could not be read: the “contents” list at the top of the file says which."}
          </p>
        )}
      </div>

      <div className="opx-note" style={{ marginBottom: 0 }}>
        <b style={{ fontSize: 13 }}>In the file</b>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(90px, max-content) minmax(0, 1fr)", gap: "6px 14px", fontSize: 13, lineHeight: 1.5 }}>
          <dt className="j-muted">Your account</dt>
          <dd style={{ margin: 0 }}>Name and email</dd>
          {SUMMARY.map((s) => (
            <div key={s.section} style={{ display: "contents" }}>
              <dt className="j-muted">{s.section}</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{s.labels.join(", ")}</dd>
            </div>
          ))}
        </dl>
        <p className="j-muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
          Items in the trash are included. A very long list is cut at a limit, newest kept, and the file says when that happened.
        </p>
      </div>

      <div className="opx-note" style={{ marginBottom: 0 }}>
        <b style={{ fontSize: 13 }}>Not in the file</b>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
          {NOT_INCLUDED.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </div>
  )
}
