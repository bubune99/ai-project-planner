"use client"

/*
 * Docs & files (owner 2026-11-13): the project's library. Core-document slots
 * on top (business plan, marketing plan, design system...), then categories,
 * cards and a reader with in-place editing. Files and images need storage
 * that doesn't exist yet, so that section says so instead of pretending.
 */

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Failed, Loading, Md, ago, askAssistant, unwrap, useJson } from "./shared"
import { fillSlots, type Doc } from "./doc-slots"

export { CORE_SLOTS, fillSlots } from "./doc-slots"

export function DocsTab({ projectId, coreDocs, project, onProjectChange }: { projectId: string; coreDocs?: string[]; project?: any; onProjectChange?: () => void }) {
  const { data, loading, error, reload } = useJson(`/api/projects/${projectId}/documents`)
  const all = useMemo(() => (unwrap<Doc[]>(data, "documents") || []).filter((d) => d && d.id), [data])
  const docs = useMemo(() => all.filter((d) => !d.is_file), [all])
  const files = useMemo(() => all.filter((d) => d.is_file), [all])
  const [uploading, setUploading] = useState(0)
  const [newTitle, setNewTitle] = useState<string | null>(null)
  const [cat, setCat] = useState<string>("all")
  const [needTitle, setNeedTitle] = useState(false)
  // ?doc=<id> (from the top search) opens that document.
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("doc")))
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Which slot's "Change" is open, and the owner's picks (owner, 2026-11-16: "Fill automatically, but let me change it").
  const [changing, setChanging] = useState<string | null>(null)
  const slotDocs: Record<string, string | null> = project?.metadata?.planner_ui?.slotDocs || {}
  const pickSlot = async (slot: string, value: string) => {
    const next = { ...slotDocs }
    if (value === "auto") delete next[slot]
    else next[slot] = value === "none" ? null : value
    const meta = project?.metadata || {}
    try {
      const r = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { ...meta, planner_ui: { ...(meta.planner_ui || {}), slotDocs: next } } }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
      setChanging(null); onProjectChange?.()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the slot") }
  }
  useEffect(() => setRenaming(null), [open])

  if (loading && !data) return <Loading what="documents" />
  if (error) return <Failed what="documents" error={error} retry={reload} />

  const slots = fillSlots(docs, coreDocs, slotDocs)
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
  const patchDoc = async (id: string, body: Record<string, string>) => {
    const r = await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`) }
  }
  const rename = async () => {
    if (!cur || renaming == null) return
    const title = renaming.trim()
    if (!title || title === cur.title) { setRenaming(null); return }
    try { await patchDoc(cur.id, { title }); setRenaming(null); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't rename it") }
  }
  /** Deletes a document or file and offers Undo for a while (the server keeps it for a day). */
  const remove = async (d: Doc) => {
    const r = await fetch(`/api/documents/${d.id}`, { method: "DELETE" }).catch(() => null)
    if (!r?.ok) { toast.error(`Couldn't delete "${d.title}"`); return }
    if (open === d.id) { setOpen(null); setEditing(false) }
    reload()
    toast(`Deleted "${d.title.slice(0, 40)}"`, {
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          const back = await fetch(`/api/documents/${d.id}/restore`, { method: "POST" }).catch(() => null)
          if (!back?.ok) toast.error("Couldn't bring it back")
          reload()
        },
      },
    })
  }
  const saveDoc = async () => {
    if (!cur) return
    setSaving(true)
    try {
      const before = cur.content || ""
      const id = cur.id
      await patchDoc(id, { content: draft })
      setEditing(false); reload()
      // A save can be taken back: Undo puts the text as it was (Docs & files check, 2026-11-15).
      toast.success("Saved", {
        duration: 10000,
        action: { label: "Undo", onClick: () => { patchDoc(id, { content: before }).then(() => { toast("Put back as it was"); reload() }, (e) => toast.error(e instanceof Error ? e.message : "Couldn't undo")) } },
      })
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save") }
    finally { setSaving(false) }
  }

  return (
    <div className="opx-col" style={{ gap: 12 }}>
      <section className="opx-sec">
        <div className="opx-sech"><h2>Core documents</h2><span className="opx-n">{slots.filter((s) => s.doc).length} of {slots.length}</span><span className="opx-link" style={{ marginLeft: "auto" }}>Choose which ones in Settings › Core documents</span></div>
        <div className="opx-slots">
          {slots.map((s) => {
            const change = project && (changing === s.name ? (
              <select className="opx-input" autoFocus aria-label={`Document for ${s.name}`} style={{ marginTop: 6, fontSize: 13 }}
                value={s.chosen ? (s.doc ? s.doc.id : "none") : "auto"}
                onChange={(e) => pickSlot(s.name, e.target.value)} onBlur={() => setChanging(null)} onKeyDown={(e) => { if (e.key === "Escape") setChanging(null) }}>
                <option value="auto">Fill automatically</option>
                <option value="none">None for now</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            ) : (
              <button type="button" className="opx-link" style={{ alignSelf: "flex-start", fontSize: 12.5, minHeight: 32, padding: 0 }} aria-label={`Change the document for ${s.name}`} onClick={() => setChanging(s.name)}>
                {s.chosen ? "Chosen by you · Change" : "Change"}
              </button>
            ))
            return s.doc ? (
              <div key={s.name} className="opx-slot has" data-slot={s.name}>
                <button type="button" style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2 }} onClick={() => { setOpen(s.doc!.id); setEditing(false) }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><i className="opx-sd ok" /><b>{s.name}</b></span><small>{s.doc.title}</small><small className="opx-muted">Updated {ago(s.doc.updated_at)}</small>
                </button>
                {change}
              </div>
            ) : (
              <div key={s.name} className="opx-slot" data-slot={s.name}>
                <i className="opx-sd" /><b>{s.name}</b><small className="opx-muted">{s.chosen ? "None, as you chose" : "Not written yet"}</small>
                <span className="opx-row" style={{ gap: 6, marginTop: 6 }}>
                  <button className="opx-btn sm" onClick={() => startNew(s.name)}>Start it</button>
                  <button className="opx-btn sm" onClick={() => askAssistant(`Draft the "${s.name}" document for this project, using its tasks, decisions and existing docs. Show me the draft before saving it.`)}>Draft with the assistant</button>
                </span>
                {change}
              </div>
            )
          })}
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
            <button className="opx-btn primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => { setNeedTitle(false); setNewTitle("") }}>New document</button>
          ) : (
            <form style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) { setNeedTitle(false); startNew(newTitle.trim()); setNewTitle(null) } else setNeedTitle(true) }}>
              <input autoFocus className="opx-input" placeholder="Document title" aria-label="New document title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNewTitle(null) }} />
              {needTitle && <span role="alert" className="opx-ch-need">Give it a title first, then press Create.</span>}
              <span className="opx-row" style={{ gap: 6 }}><button type="submit" className="opx-btn primary sm">Create</button><button type="button" className="opx-btn sm" onClick={() => setNewTitle(null)}>Cancel</button></span>
            </form>
          )}
        </aside>
        {cur ? (
          <section className="opx-sec" style={{ minHeight: 400 }}>
            <div className="opx-row" style={{ marginBottom: 6 }}>
              <button className="opx-link opx-act" onClick={() => { setOpen(null); setEditing(false) }}>‹ {cat === "all" ? "All documents" : label(cat)}</button>
              <span className="opx-row" style={{ marginLeft: "auto", gap: 6 }}>
                {editing ? (
                  <>
                    <button className="opx-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                    <button className="opx-btn primary" onClick={saveDoc} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </>
                ) : (
                  <>
                    <button className="opx-btn" onClick={() => setRenaming(cur.title)}>Rename</button>
                    <button className="opx-btn" onClick={() => remove(cur)}>Delete</button>
                    <button className="opx-btn" onClick={() => { setDraft(cur.content || ""); setEditing(true) }}>Edit</button>
                  </>
                )}
              </span>
            </div>
            <div className="opx-muted" style={{ fontSize: 12.5 }}>{cur.category || ""} · updated {ago(cur.updated_at)}</div>
            {renaming != null ? (
              <form style={{ display: "flex", gap: 6, margin: "6px 0 14px", flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); rename() }}>
                <input autoFocus className="opx-input" style={{ flex: "1 1 240px", fontSize: 18 }} aria-label="Document title" value={renaming} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null) }} />
                <button type="submit" className="opx-btn primary">Save title</button>
                <button type="button" className="opx-btn" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : <h2 style={{ fontSize: 26, margin: "6px 0 14px", fontWeight: 600 }}>{cur.title}</h2>}
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
                  <div key={f.id} data-file={f.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <a className="opx-file" href={`/api/documents/${f.id}/file`} target="_blank" rel="noreferrer">
                      {f.file_type?.startsWith("image/")
                        ? <span className="opx-thumb" style={{ backgroundImage: `url(/api/documents/${f.id}/file)` }} />
                        : <span className="opx-thumb opx-ext">{(f.title.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>}
                      <b>{f.title}</b>
                      <small className="opx-muted">{f.file_size ? `${Math.max(1, Math.round(f.file_size / 1024))} KB · ` : ""}{ago(f.created_at)}</small>
                    </a>
                    <button type="button" className="opx-link" style={{ alignSelf: "flex-start", fontSize: 12.5, minHeight: 32, padding: 0 }} aria-label={`Remove the file ${f.title}`} onClick={() => remove(f)}>Remove</button>
                  </div>
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
