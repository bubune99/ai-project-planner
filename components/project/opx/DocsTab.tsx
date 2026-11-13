"use client"

/*
 * Docs & files (owner 2026-11-13): the project's library. Core-document slots
 * on top (business plan, marketing plan, design system...), then categories,
 * cards and a reader with in-place editing. Files and images need storage
 * that doesn't exist yet, so that section says so instead of pretending.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Failed, Loading, Md, ago, askAssistant, unwrap, useJson } from "./shared"

interface Doc { id: string; title: string; content?: string | null; category?: string | null; doc_type?: string | null; updated_at?: string | null; created_at?: string | null; is_file?: boolean; file_type?: string | null; file_size?: number | null }

/** The default slots. Settings › Core documents lets a project choose its own (saved in project metadata). */
export const CORE_SLOTS: { name: string; match: RegExp; category?: string; docType?: string }[] = [
  { name: "Business plan", match: /business plan|business model|revenue model/i },
  { name: "Marketing plan", match: /marketing|go[- ]to[- ]market|launch plan/i },
  { name: "Design system", match: /design system|brand|tokens|style guide|typography/i, category: "design" },
  { name: "Design criteria", match: /criteria|principles|guidelines|preferences/i },
  { name: "Vision", match: /vision/i, category: "vision" },
  { name: "Product spec", match: /spec|prd|requirements|settings map/i, docType: "requirements" },
  { name: "Flows", match: /^flow /i, category: "flows" },
  { name: "Operations & security", match: /security|operations|runbook|audit/i, category: "security" },
]

export function fillSlots(docs: Doc[], names?: string[]) {
  const used = new Set<string>()
  const slots = names ? CORE_SLOTS.filter((s) => names.includes(s.name)).concat(names.filter((n) => !CORE_SLOTS.some((s) => s.name === n)).map((n) => ({ name: n, match: new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }))) : CORE_SLOTS
  return slots.map((s) => {
    const d = docs.find((x) => !used.has(x.id) && (("category" in s && s.category && (x.category || "").toLowerCase() === s.category) || s.match.test(x.title) || ("docType" in s && s.docType && x.doc_type === s.docType)))
    if (d) used.add(d.id)
    return { name: s.name, doc: d || null }
  })
}

export function DocsTab({ projectId, coreDocs }: { projectId: string; coreDocs?: string[] }) {
  const { data, loading, error, reload } = useJson(`/api/projects/${projectId}/documents`)
  const all = useMemo(() => (unwrap<Doc[]>(data, "documents") || []).filter((d) => d && d.id), [data])
  const docs = useMemo(() => all.filter((d) => !d.is_file), [all])
  const files = useMemo(() => all.filter((d) => d.is_file), [all])
  const [uploading, setUploading] = useState(0)
  const [newTitle, setNewTitle] = useState<string | null>(null)
  const [cat, setCat] = useState<string>("all")
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  if (loading && !data) return <Loading what="documents" />
  if (error) return <Failed what="documents" error={error} retry={reload} />

  const slots = fillSlots(docs, coreDocs)
  const cats = new Map<string, Doc[]>()
  for (const d of docs) { const c = d.category || "Other"; cats.set(c, [...(cats.get(c) || []), d]) }
  const list = (cat === "all" ? docs : cats.get(cat) || []).filter((d) => !q || d.title.toLowerCase().includes(q.toLowerCase()) || (d.content || "").toLowerCase().includes(q.toLowerCase()))
  const cur = docs.find((d) => d.id === open) || null
  const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)

  const startNew = async (title: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: `# ${title}\n\n`, doc_type: "general", category: title.toLowerCase().includes("design") ? "design" : "planning" }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`)
      const id = j?.document?.id || j?.data?.id || j?.data?.document?.id || j?.id
      reload()
      if (id) { setOpen(id); setDraft(`# ${title}\n\n`); setEditing(true) }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the document") }
  }
  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    const arr = Array.from(list)
    setUploading(arr.length)
    let ok = 0
    for (const f of arr) {
      const fd = new FormData()
      fd.append("file", f); fd.append("projectId", projectId); fd.append("title", f.name)
      fd.append("category", f.type.startsWith("image/") ? "images" : "files")
      try {
        const r = await fetch("/api/upload", { method: "POST", body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        ok++
      } catch (e) { toast.error(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`) }
    }
    setUploading(0)
    if (ok) { toast.success(`Uploaded ${ok} file${ok > 1 ? "s" : ""}`); reload() }
  }
  const saveDoc = async () => {
    if (!cur) return
    setSaving(true)
    try {
      const r = await fetch(`/api/documents/${cur.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      toast.success("Saved"); setEditing(false); reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save") }
    finally { setSaving(false) }
  }

  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <section className="opx-sec">
        <div className="opx-sech"><h2>Core documents</h2><span className="opx-n">{slots.filter((s) => s.doc).length} of {slots.length}</span><span className="opx-link" style={{ marginLeft: "auto" }}>Choose which ones in Settings › Core documents</span></div>
        <div className="opx-slots">
          {slots.map((s) => s.doc ? (
            <button key={s.name} className="opx-slot has" onClick={() => { setOpen(s.doc!.id); setEditing(false) }}>
              <i className="opx-sd ok" /><b>{s.name}</b><small>{s.doc.title}</small><small className="opx-muted">Updated {ago(s.doc.updated_at)}</small>
            </button>
          ) : (
            <div key={s.name} className="opx-slot">
              <i className="opx-sd" /><b>{s.name}</b><small className="opx-muted">Not written yet</small>
              <span className="opx-row" style={{ gap: 6, marginTop: 6 }}>
                <button className="opx-btn sm" onClick={() => startNew(s.name)}>Start it</button>
                <button className="opx-btn sm" onClick={() => askAssistant(`Draft a ${s.name.toLowerCase()} for this project, using its tasks, decisions and existing docs. Show me the draft before saving it.`)}>Draft with the assistant</button>
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="opx-docs2">
        <aside className="opx-sec">
          <button className={`opx-dc${cat === "all" ? " on" : ""}`} onClick={() => { setCat("all"); setOpen(null) }}>All documents <em>{docs.length}</em></button>
          {[...cats.entries()].sort().map(([c, l]) => (
            <button key={c} className={`opx-dc${cat === c ? " on" : ""}`} onClick={() => { setCat(c); setOpen(null) }}>{label(c)} <em>{l.length}</em></button>
          ))}
          <button className={`opx-dc${cat === "__files" ? " on" : ""}`} style={{ marginTop: 8, borderTop: "1px solid var(--opx-line)", borderRadius: 0, paddingTop: 12 }} onClick={() => { setCat("__files"); setOpen(null) }}>Files & images <em>{files.length}</em></button>
          {newTitle == null ? (
            <button className="opx-btn primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => setNewTitle("")}>＋ New document</button>
          ) : (
            <form style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) { startNew(newTitle.trim()); setNewTitle(null) } }}>
              <input autoFocus className="opx-input" placeholder="Document title" aria-label="New document title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNewTitle(null) }} />
              <span className="opx-row" style={{ gap: 6 }}><button type="submit" className="opx-btn primary sm">Create</button><button type="button" className="opx-btn sm" onClick={() => setNewTitle(null)}>Cancel</button></span>
            </form>
          )}
        </aside>
        {cur ? (
          <section className="opx-sec" style={{ minHeight: 400 }}>
            <div className="opx-row" style={{ marginBottom: 6 }}>
              <button className="opx-link" style={{ padding: 0 }} onClick={() => { setOpen(null); setEditing(false) }}>‹ {cat === "all" ? "All documents" : label(cat)}</button>
              <span className="opx-row" style={{ marginLeft: "auto", gap: 6 }}>
                {editing ? (
                  <>
                    <button className="opx-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                    <button className="opx-btn primary" onClick={saveDoc} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </>
                ) : <button className="opx-btn" onClick={() => { setDraft(cur.content || ""); setEditing(true) }}>Edit</button>}
              </span>
            </div>
            <div className="opx-muted" style={{ fontSize: 12.5 }}>{cur.category || ""} · updated {ago(cur.updated_at)}</div>
            <h2 style={{ fontSize: 26, margin: "6px 0 14px", fontWeight: 600 }}>{cur.title}</h2>
            {editing
              ? <textarea className="opx-input" value={draft} onChange={(e) => setDraft(e.target.value)} rows={28} aria-label="Document text (Markdown)" />
              : <Md text={cur.content || "_Empty document._"} />}
          </section>
        ) : cat === "__files" ? (
          <section className="opx-sec">
            <label
              className="opx-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files) }}
            >
              <b>{uploading ? `Uploading ${uploading}…` : "Drop files or images here"}</b>
              <span className="opx-muted">PDFs, logos, mock-ups, spreadsheets and brand assets, up to 50 MB each.</span>
              <span className="opx-btn">Choose files</span>
              <input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = "" }} />
            </label>
            {files.length > 0 && (
              <div className="opx-fgrid">
                {files.map((f) => (
                  <a key={f.id} className="opx-file" href={`/api/documents/${f.id}/file`} target="_blank" rel="noreferrer">
                    {f.file_type?.startsWith("image/")
                      ? <span className="opx-thumb" style={{ backgroundImage: `url(/api/documents/${f.id}/file)` }} />
                      : <span className="opx-thumb opx-ext">{(f.title.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>}
                    <b>{f.title}</b>
                    <small className="opx-muted">{f.file_size ? `${Math.max(1, Math.round(f.file_size / 1024))} KB · ` : ""}{ago(f.created_at)}</small>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="opx-sec">
            <input className="opx-input" style={{ maxWidth: 420, marginBottom: 12 }} placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
            {list.length === 0 ? <div className="opx-empty">No documents here yet.</div> : (
              <div className="opx-dgrid">
                {list.map((d) => (
                  <button key={d.id} className="opx-dcard" onClick={() => { setOpen(d.id); setEditing(false) }}>
                    <small className="opx-muted">{d.category || ""}</small>
                    <b>{d.title}</b>
                    <p>{(d.content || "").replace(/```[\s\S]*?```/g, " ").replace(/[#*`>|_-]+/g, " ").slice(0, 200)}</p>
                    <small className="opx-muted">Updated {ago(d.updated_at)}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
