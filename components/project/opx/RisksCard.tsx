"use client"

/*
 * A project's risk register, on its Overview. Kept in projects.metadata.risks.
 * Overview check, 2026-11-15: a risk could not be edited after it was added (only its status), delete used the
 * browser's own box with no undo, and the table scrolled sideways on a phone. Now each risk is a card that can be
 * changed in place, and delete offers Undo.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"

export type Risk = {
  id: string
  title: string
  sev: "high" | "med" | "low"
  lik: "high" | "med" | "low"
  owner: string
  mitig: string
  status: "open" | "monitoring" | "mitigating" | "mitigated" | "scheduled"
}

const LEVEL: Record<Risk["sev"], string> = { high: "High", med: "Medium", low: "Low" }
const STATUS: Risk["status"][] = ["open", "monitoring", "mitigating", "mitigated", "scheduled"]
const STATUS_WORD: Record<Risk["status"], string> = { open: "Open", monitoring: "Monitoring", mitigating: "Mitigating", mitigated: "Mitigated", scheduled: "Scheduled" }
const TONE: Record<Risk["sev"], string> = { high: "var(--opx-hot, #c2410c)", med: "var(--opx-warn, #b45309)", low: "var(--opx-muted)" }
const EMPTY: Risk = { id: "", title: "", sev: "med", lik: "med", owner: "", mitig: "", status: "open" }
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}`)

function RiskForm({ value, onSave, onCancel, saving, label }: { value: Risk; onSave: (r: Risk) => void; onCancel: () => void; saving: boolean; label: string }) {
  const [f, setF] = useState<Risk>(value)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Risk>(k: K, v: Risk[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <div className="opx-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input className="opx-input" aria-label="Risk" placeholder="What could go wrong" value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="opx-input" aria-label="Severity" value={f.sev} onChange={(e) => set("sev", e.target.value as Risk["sev"])}>
          {(["high", "med", "low"] as const).map((v) => <option key={v} value={v}>Severity: {LEVEL[v]}</option>)}
        </select>
        <select className="opx-input" aria-label="Likelihood" value={f.lik} onChange={(e) => set("lik", e.target.value as Risk["lik"])}>
          {(["high", "med", "low"] as const).map((v) => <option key={v} value={v}>Likelihood: {LEVEL[v]}</option>)}
        </select>
        <select className="opx-input" aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value as Risk["status"])}>
          {STATUS.map((s) => <option key={s} value={s}>Status: {STATUS_WORD[s]}</option>)}
        </select>
      </div>
      <input className="opx-input" aria-label="Owner" placeholder="Who watches it (optional)" value={f.owner} onChange={(e) => set("owner", e.target.value)} />
      <textarea className="opx-input" aria-label="Mitigation plan" rows={2} placeholder="What is being done about it (optional)" value={f.mitig} onChange={(e) => set("mitig", e.target.value)} style={{ resize: "none" }} />
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--opx-hot, #c2410c)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="opx-btn primary" disabled={saving} style={{ minHeight: 44 }} onClick={() => (f.title.trim() ? onSave({ ...f, title: f.title.trim() }) : setErr("Say what the risk is"))}>
          {saving ? "Saving…" : label}
        </button>
        <button className="opx-btn" style={{ minHeight: 44 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export function RisksCard({ projectId, project, onChange }: { projectId: string; project: any; onChange: () => void }) {
  const [risks, setRisks] = useState<Risk[]>(Array.isArray(project?.metadata?.risks) ? project.metadata.risks : [])
  const [editing, setEditing] = useState<string | null>(null) // a risk's id, or "new"
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (Array.isArray(project?.metadata?.risks)) setRisks(project.metadata.risks) }, [project?.metadata?.risks])

  const persist = async (next: Risk[]): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { ...(project?.metadata || {}), risks: next } }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || "The risk was not saved") }
      setRisks(next)
      onChange()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The risk was not saved")
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = async (r: Risk) => {
    const next = editing === "new" ? [...risks, { ...r, id: newId() }] : risks.map((x) => (x.id === r.id ? r : x))
    if (await persist(next)) setEditing(null)
  }

  const remove = async (r: Risk) => {
    const at = risks.findIndex((x) => x.id === r.id)
    const before = risks
    if (!(await persist(risks.filter((x) => x.id !== r.id)))) return
    toast(`Deleted the risk "${r.title.slice(0, 40)}"`, {
      duration: 10000,
      action: { label: "Undo", onClick: () => { const back = [...before.filter((x) => x.id !== r.id)]; back.splice(Math.max(0, at), 0, r); void persist(back) } },
    })
  }

  const open = risks.filter((r) => r.status !== "mitigated")
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Risks <span className="opx-muted" style={{ fontWeight: 400, fontSize: 13 }}>{open.length} open{risks.length > open.length ? `, ${risks.length - open.length} mitigated` : ""}</span></h3>
        {editing !== "new" && <button className="opx-btn" style={{ minHeight: 44 }} onClick={() => setEditing("new")}>Add a risk</button>}
      </div>
      {editing === "new" && <RiskForm value={EMPTY} label="Add risk" saving={saving} onSave={save} onCancel={() => setEditing(null)} />}
      {risks.length === 0 && editing !== "new" && <p className="opx-muted" style={{ margin: 0, fontSize: 13 }}>No risks yet. Add what could derail this project.</p>}
      {risks.map((r) =>
        editing === r.id ? (
          <RiskForm key={r.id} value={r} label="Save" saving={saving} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div key={r.id} className="opx-card" data-risk={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: r.status === "mitigated" ? 0.7 : 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ flex: "1 1 200px", fontSize: 14 }}>{r.title}</b>
              <span style={{ fontSize: 12.5, color: TONE[r.sev] }}>Severity {LEVEL[r.sev].toLowerCase()}</span>
              <span className="opx-muted" style={{ fontSize: 12.5 }}>Likelihood {LEVEL[r.lik].toLowerCase()}</span>
            </div>
            {(r.owner || r.mitig) && (
              <div className="opx-muted" style={{ fontSize: 13 }}>{[r.owner && `Watched by ${r.owner}`, r.mitig].filter(Boolean).join(". ")}</div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="opx-input" aria-label={`Status of the risk: ${r.title}`} value={r.status} disabled={saving}
                onChange={(e) => void persist(risks.map((x) => (x.id === r.id ? { ...x, status: e.target.value as Risk["status"] } : x)))}>
                {STATUS.map((s) => <option key={s} value={s}>{STATUS_WORD[s]}</option>)}
              </select>
              <button className="opx-btn" style={{ minHeight: 44 }} onClick={() => setEditing(r.id)} aria-label={`Edit the risk: ${r.title}`}>Edit</button>
              <button className="opx-btn" style={{ minHeight: 44 }} onClick={() => void remove(r)} aria-label={`Delete the risk: ${r.title}`}>Delete</button>
            </div>
          </div>
        ),
      )}
    </div>
  )
}
