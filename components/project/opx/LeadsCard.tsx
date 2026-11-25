"use client"

/*
 * Notes left on the owner's sites, on the project's Overview (card 1711d9e8; route app/api/projects/[id]/leads).
 * Shown only when the project has some, so other projects carry no empty box. A note is a stranger's words: shown
 * as plain text, never as markdown or links. Reply opens the owner's mail; marking replied or closed is one press.
 */
import { useState } from "react"
import { toast } from "sonner"
import { Section, Failed, Seg, ago, fmtDate, useJson } from "./shared"

type Status = "new" | "replied" | "closed"
type Lead = { id: string; source: string; name: string; email: string; company: string | null; topic: string | null; message: string; status: Status; createdAt: string }

const STATUS_OPTIONS: [Status, string][] = [["new", "New"], ["replied", "Replied"], ["closed", "Closed"]]

export function LeadsCard({ projectId }: { projectId: string }) {
  const url = `/api/projects/${projectId}/leads`
  const { data, error, reload } = useJson<{ leads: Lead[] }>(url)
  const [changed, setChanged] = useState<Record<string, Status>>({})

  if (error) return <Failed what="notes from your site" error={error} retry={reload} />
  const leads = data?.leads ?? []
  if (!leads.length) return null
  const open = leads.filter((l) => (changed[l.id] ?? l.status) === "new").length

  async function mark(lead: Lead, status: Status) {
    const before = changed[lead.id] ?? lead.status
    setChanged((c) => ({ ...c, [lead.id]: status }))
    try {
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: lead.id, status }) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
    } catch (e) {
      setChanged((c) => ({ ...c, [lead.id]: before }))
      toast.error(`Could not mark it: ${e instanceof Error ? e.message : "try again"}`)
    }
  }

  return (
    <Section title="Notes from your site" count={open ? `${open} new` : `${leads.length}`}>
      <div className="opx-col" style={{ gap: 10 }} data-testid="leads">
        {leads.map((l) => {
          const status = changed[l.id] ?? l.status
          const about = [l.company, l.topic && `about ${l.topic}`].filter(Boolean).join(", ")
          return (
            <article key={l.id} className="opx-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
                <strong>{l.name}</strong>
                <span style={{ color: "var(--opx-muted)" }}>{l.email}{about ? ` · ${about}` : ""}</span>
                <span style={{ marginLeft: "auto", color: "var(--opx-muted)", fontSize: 13 }} title={fmtDate(l.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}>{ago(l.createdAt)} · {l.source}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{l.message}</p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <a className="opx-btn sm" style={{ whiteSpace: "nowrap" }} href={`mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent("Re: your note to FAR CNCPT")}`}>Reply by email</a>
                <Seg label={`Status of the note from ${l.name}`} value={status} options={STATUS_OPTIONS} onChange={(s) => mark(l, s)} />
              </div>
            </article>
          )
        })}
      </div>
    </Section>
  )
}
