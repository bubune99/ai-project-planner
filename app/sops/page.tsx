"use client"

import dynamic from "next/dynamic"
import { parseMapBlock, seedMap, stripMapBlock, writeMapBlock, type Layer } from "@/lib/sops/process-map"

/*
 * Library: SOPs plus skills, templates and protocols (owner 2026-11-13: "sops
 * and library can probably be merged"). SOPs are laid out like a project's
 * Docs & files: categories
 * on the left, cards, a reader with edit in place, and a new-SOP form.
 * Same data and routes as before: GET/POST /api/sops, PATCH/DELETE /api/sops/:id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import { Md, Seg, ago } from "@/components/project/opx/shared"

// The drawing library is only fetched when a document that carries a map is opened.
const ProcessMap = dynamic(() => import("@/components/project/opx/ProcessMap").then((m) => m.ProcessMap), { ssr: false, loading: () => <p className="opx-muted">Loading the drawing…</p> })

interface Sop {
  id: string
  title: string
  content: string
  category: string | null
  status: "draft" | "active" | "archived"
  updatedAt: string
  project: { id: string; name: string } | null
}
type Status = Sop["status"]
type Form = { title: string; content: string; category: string; status: Status }

const STATUS_LABEL: Record<Status, string> = { active: "Active", draft: "Draft", archived: "Archived" }
const STATUS_COLOR: Record<Status, string> = { active: "var(--opx-good)", draft: "var(--opx-warn)", archived: "#8a94a3" }
const UNCAT = "Uncategorized"

/** The rest of the library: each keeps its own page; counts come from the same endpoints the old Library page used. */
const SHELVES = [
  { title: "Skills", hint: "Building blocks of every template", href: "/library/skills", api: "/api/skills" },
  { title: "Templates", hint: "Reusable feature blueprints", href: "/library/templates", api: "/api/feature-templates" },
  { title: "Protocols", hint: "Rules that fire at key moments", href: "/library/protocols", api: "/api/protocols" },
]

function useShelfCounts() {
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  useEffect(() => {
    let off = false
    Promise.all(SHELVES.map((x) => fetch(x.api).then((r) => r.json()).then((j) => j?.meta?.counts?.total ?? (Array.isArray(j?.data) ? j.data.length : null)).catch(() => null)))
      .then((n) => { if (!off) setCounts(Object.fromEntries(SHELVES.map((x, i) => [x.href, n[i]]))) })
    return () => { off = true }
  }, [])
  return counts
}

export default function LibraryPage() {
  const shelf = useShelfCounts()
  const [sops, setSops] = useState<Sop[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState<"all" | Status>("active")
  const [cat, setCat] = useState("all")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null) // editing the open SOP, or a new one when open is null
  const [saving, setSaving] = useState(false)

  const fetchSops = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/sops")
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Couldn't load SOPs")
      setSops(json.data || [])
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load SOPs")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchSops() }, [fetchSops])

  const byStatus = useMemo(() => sops.filter((s) => status === "all" || s.status === status), [sops, status])
  const cats = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of byStatus) m.set(s.category || UNCAT, (m.get(s.category || UNCAT) || 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [byStatus])
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return byStatus
      .filter((s) => cat === "all" || (s.category || UNCAT) === cat)
      .filter((s) => !term || s.title.toLowerCase().includes(term) || s.content.toLowerCase().includes(term))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
  }, [byStatus, cat, q])
  const cur = open ? sops.find((s) => s.id === open) || null : null
  // A document that carries a process map shows it drawn, above its words.
  const curMap = useMemo(() => (cur ? parseMapBlock(cur.content) : null), [cur])
  const [mapState, setMapState] = useState<"" | "saving" | "saved" | "failed">("")
  const mapSaves = useRef<Promise<void>>(Promise.resolve())
  /** Keeps a change to the map: shown at once, then saved in the order the changes were made. */
  const saveMap = (sop: Sop, next: Layer) => {
    const content = writeMapBlock(sop.content, next)
    setSops((all) => all.map((x) => (x.id === sop.id ? { ...x, content } : x)))
    setMapState("saving")
    mapSaves.current = mapSaves.current.then(async () => {
      try {
        const res = await fetch(`/api/sops/${sop.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) throw new Error(json?.error?.message || "Save failed")
        setMapState("saved")
      } catch (e) {
        setMapState("failed")
        toast.error(e instanceof Error ? `The map was not saved: ${e.message}` : "The map was not saved")
        fetchSops()
      }
    })
  }
  const newMap = async () => {
    const res = await fetch("/api/sops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "How we build: from plan to proven", category: "How we work", status: "active", content: writeMapBlock("Who does what, in order, from a plan to a page proved to work: the lanes, the gates and the loops. Double-click a stage to open the loop inside it; right-click anything to change it.", seedMap()) }) })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) { toast.error(json?.error?.message || "Could not create the map"); return }
    await fetchSops()
    setForm(null); setStatus("active"); setCat("all"); setOpen(json.data?.id ?? null)
  }
  const count = (k: Status) => sops.filter((s) => s.status === k).length

  const save = async () => {
    if (!form) return
    if (!form.title.trim()) { toast.error("A title is required"); return }
    setSaving(true)
    try {
      const res = await fetch(cur ? `/api/sops/${cur.id}` : "/api/sops", {
        method: cur ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // The form edits the words only; a map the document carries is put back as it was.
        body: JSON.stringify({ ...form, content: curMap ? writeMapBlock(form.content, curMap) : form.content, category: form.category.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Save failed")
      toast.success(cur ? "Saved" : "SOP created")
      if (!cur && json.data?.id) setOpen(json.data.id)
      setForm(null)
      await fetchSops()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Sop) => {
    if (!confirm(`Delete the SOP "${s.title}"? This can't be undone.`)) return
    const res = await fetch(`/api/sops/${s.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Couldn't delete it"); return }
    setOpen(null); setForm(null); fetchSops()
  }

  const editor = form && (
    <section className="opx-sec" style={{ minHeight: 400 }}>
      <div className="opx-row" style={{ marginBottom: 10 }}>
        <b style={{ fontSize: 16 }}>{cur ? "Edit SOP" : "New SOP"}</b>
        <span className="opx-row" style={{ marginLeft: "auto", gap: 6 }}>
          <button className="opx-btn" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button className="opx-btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </span>
      </div>
      <div className="opx-col" style={{ gap: 10 }}>
        <input className="opx-input" placeholder="Title" aria-label="SOP title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        <div className="opx-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <input className="opx-input" style={{ maxWidth: 260 }} list="sop-cats" placeholder="Category" aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="sop-cats">{cats.filter(([c]) => c !== UNCAT).map(([c]) => <option key={c} value={c} />)}</datalist>
          <Seg label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[["active", "Active"], ["draft", "Draft"], ["archived", "Archived"]]} />
        </div>
        <textarea className="opx-input" rows={24} placeholder="Steps, in Markdown" aria-label="SOP text (Markdown)" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
      </div>
    </section>
  )

  return (
    <DashboardLayout>
      <div className="opx-page">
        <header className="opx-pbar">
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1>Library</h1>
            <div className="opx-muted">How things get done: your SOPs, plus the skills, templates and protocols agents work from.</div>
          </div>
          <div className="opx-stats">
            <div className="opx-stat"><b>{sops.length}</b><span>SOPs</span></div>
            <div className="opx-stat"><b>{count("active")}</b><span>Active</span></div>
            <div className="opx-stat"><b>{count("draft")}</b><span>Draft</span></div>
          </div>
        </header>

        <div className="opx-docs2">
          <aside className="opx-sec">
            <div className="opx-muted" style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px 4px" }}>SOPs</div>
            <Seg label="Status" value={status} onChange={(v) => { setStatus(v); setCat("all"); setOpen(null) }} options={[["active", "Active"], ["draft", "Draft"], ["archived", "Archived"], ["all", "All"]]} />
            <div style={{ height: 10 }} />
            <button className={`opx-dc${cat === "all" ? " on" : ""}`} onClick={() => { setCat("all"); setOpen(null) }}>All SOPs <em>{byStatus.length}</em></button>
            {cats.map(([c, n]) => (
              <button key={c} className={`opx-dc${cat === c ? " on" : ""}`} onClick={() => { setCat(c); setOpen(null) }}>{c} <em>{n}</em></button>
            ))}
            <button className="opx-btn primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => { setOpen(null); setForm({ title: "", content: "", category: cat === "all" || cat === UNCAT ? "" : cat, status: "active" }) }}>＋ New SOP</button>
            <button className="opx-btn" style={{ marginTop: 6, width: "100%", justifyContent: "center" }} onClick={newMap}>New process map</button>
            <div className="opx-muted" style={{ fontSize: 12, fontWeight: 600, margin: "18px 0 6px 4px", paddingTop: 12, borderTop: "1px solid var(--opx-line)" }}>For agents</div>
            {SHELVES.map((x) => (
              <Link key={x.href} href={x.href} className="opx-dc" style={{ textDecoration: "none" }} title={x.hint}>
                {x.title} <em>{shelf[x.href] ?? "–"}</em>
              </Link>
            ))}
          </aside>

          {form ? editor : cur ? (
            <section className="opx-sec" style={{ minHeight: 400 }}>
              <div className="opx-row" style={{ marginBottom: 6 }}>
                <button className="opx-link" style={{ padding: 0 }} onClick={() => setOpen(null)}>‹ {cat === "all" ? "All SOPs" : cat}</button>
                <span className="opx-row" style={{ marginLeft: "auto", gap: 6 }}>
                  <button className="opx-btn" onClick={() => remove(cur)}>Delete</button>
                  <button className="opx-btn" onClick={() => setForm({ title: cur.title, content: stripMapBlock(cur.content), category: cur.category ?? "", status: cur.status })}>{curMap ? "Edit the words" : "Edit"}</button>
                </span>
              </div>
              <div className="opx-row opx-muted" style={{ fontSize: 12.5, gap: 6 }}>
                <i className="opx-dot" style={{ background: STATUS_COLOR[cur.status], width: 7, height: 7 }} />{STATUS_LABEL[cur.status]}
                {cur.category && <> · {cur.category}</>}{cur.project && <> · {cur.project.name}</>} · updated {ago(cur.updatedAt)}
              </div>
              <h2 style={{ fontSize: 26, margin: "6px 0 14px", fontWeight: 600 }}>{cur.title}</h2>
              {curMap ? (
                <>
                  {stripMapBlock(cur.content) && <Md text={stripMapBlock(cur.content)} />}
                  <div className="opx-row opx-muted" style={{ fontSize: 12.5, minHeight: 18 }} role="status">{mapState === "saving" ? "Saving the map" : mapState === "saved" ? "Map saved" : mapState === "failed" ? "The last change was not saved" : ""}</div>
                  <ProcessMap key={cur.id} map={curMap} rootName={cur.title} onChange={(next) => saveMap(cur, next)} />
                </>
              ) : <Md text={cur.content || "_Empty SOP._"} />}
            </section>
          ) : (
            <section className="opx-sec">
              <input className="opx-input" style={{ maxWidth: 420, marginBottom: 12 }} placeholder="Search SOPs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search SOPs" />
              {loading && !sops.length && <p className="opx-muted">Loading…</p>}
              {err && <div className="opx-empty">Couldn't load SOPs: {err} <button className="opx-link" onClick={fetchSops}>Try again</button></div>}
              {!loading && !err && list.length === 0 && <div className="opx-empty">No SOPs here yet.</div>}
              {list.length > 0 && (
                <div className="opx-dgrid">
                  {list.map((s) => (
                    <button key={s.id} className="opx-dcard" onClick={() => setOpen(s.id)}>
                      <small className="opx-muted">{s.category || UNCAT}{s.project ? ` · ${s.project.name}` : ""}</small>
                      <b>{s.title}</b>
                      <p>{s.content.replace(/```[\s\S]*?```/g, " ").replace(/[#*`>|_-]+/g, " ").slice(0, 200)}</p>
                      <small className="opx-row opx-muted" style={{ gap: 6 }}><i className="opx-dot" style={{ background: STATUS_COLOR[s.status], width: 6, height: 6 }} />{STATUS_LABEL[s.status]} · updated {ago(s.updatedAt)}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
