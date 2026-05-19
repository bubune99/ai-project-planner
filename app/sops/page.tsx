"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"

interface Sop {
  id: string
  title: string
  content: string
  category: string | null
  status: "draft" | "active" | "archived"
  updatedAt: string
  project: { id: string; name: string } | null
}

type Counts = { draft: number; active: number; archived: number; total: number }

const STATUSES = ["active", "draft", "archived"] as const
const STATUS_PILL: Record<string, string> = { active: "j-pos", draft: "j-warn", archived: "j-muted" }

const empty = { title: "", content: "", category: "", status: "active" as Sop["status"] }

export default function SopsPage() {
  const [sops, setSops] = useState<Sop[]>([])
  const [counts, setCounts] = useState<Counts>({ draft: 0, active: 0, archived: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Sop | null>(null)
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchSops = useCallback(async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (filter) qs.set("status", filter)
      if (search.trim()) qs.set("search", search.trim())
      const res = await fetch(`/api/sops?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to load SOPs")
      setSops(json.data || [])
      if (json.meta?.counts) setCounts(json.meta.counts)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load SOPs")
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchSops() }, [fetchSops])

  const openCreate = () => { setEditing(null); setForm(empty); setShowForm(true); setErr(null) }
  const openEdit = (s: Sop) => {
    setEditing(s)
    setForm({ title: s.title, content: s.content, category: s.category ?? "", status: s.status })
    setShowForm(true); setErr(null)
  }

  const save = async () => {
    if (!form.title.trim()) { setErr("Title is required"); return }
    try {
      setSaving(true)
      const res = await fetch(editing ? `/api/sops/${editing.id}` : "/api/sops", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Save failed")
      setShowForm(false); setEditing(null); setForm(empty)
      await fetchSops()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Sop) => {
    if (!confirm(`Delete SOP "${s.title}"?`)) return
    await fetch(`/api/sops/${s.id}`, { method: "DELETE" })
    await fetchSops()
  }

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Vitals + new */}
        <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
          <div className="j-row" style={{ gap: 8 }}>
            <span className="j-tab" style={{ cursor: "default" }}>Total <b style={{ marginLeft: 6 }}>{counts.total}</b></span>
            <span className="j-tab" style={{ cursor: "default" }}>Active <b style={{ marginLeft: 6 }}>{counts.active}</b></span>
            <span className="j-tab" style={{ cursor: "default" }}>Draft <b style={{ marginLeft: 6 }}>{counts.draft}</b></span>
          </div>
          <button className="j-btn j-btn-primary" onClick={openCreate}>
            <Icon name="plus" size={14} /> New SOP
          </button>
        </div>

        {/* Filters */}
        <div className="j-row j-wrap" style={{ gap: 8 }}>
          <div className="j-tabs">
            <span className={`j-tab${filter === "" ? " j-active" : ""}`} onClick={() => setFilter("")}>All</span>
            {STATUSES.map(s => (
              <span key={s} className={`j-tab${filter === s ? " j-active" : ""}`} onClick={() => setFilter(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>
          <input
            className="j-search"
            style={{ minWidth: 220 }}
            placeholder="Search SOPs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Editor */}
        {showForm && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">{editing ? "Edit SOP" : "New SOP"}</p>
              <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setShowForm(false)} aria-label="Close">
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="j-col" style={{ gap: 10 }}>
              <input className="j-search" placeholder="Title" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <div className="j-row" style={{ gap: 8 }}>
                <input className="j-search" style={{ flex: 1 }} placeholder="Category (optional)" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                <select className="j-search" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Sop["status"] }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <textarea
                placeholder="Procedure steps (markdown)…"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={10}
                style={{
                  width: "100%", background: "oklch(1 0 0 / 0.04)", color: "oklch(0.985 0 0)",
                  border: "none", boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8,
                  padding: 12, fontFamily: "var(--font-geist-mono, monospace)", fontSize: 13, resize: "vertical",
                }}
              />
              {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create SOP"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="j-card"><span className="j-muted">Loading SOPs…</span></div>
        ) : err && !showForm ? (
          <div className="j-card"><span className="j-muted">{err}</span></div>
        ) : sops.length === 0 ? (
          <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 48 }}>
            <Icon name="sop" size={28} />
            <p className="j-muted">No SOPs yet. Capture your first standard operating procedure.</p>
            <button className="j-btn j-btn-primary" onClick={openCreate}><Icon name="plus" size={14} /> New SOP</button>
          </div>
        ) : (
          <div className="j-col" style={{ gap: 10 }}>
            {sops.map(s => (
              <div key={s.id} className="j-card">
                <div className="j-card-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="j-row" style={{ gap: 8 }}>
                      <p className="j-card-title">{s.title}</p>
                      <span className={`j-pill ${STATUS_PILL[s.status]}`}>{s.status}</span>
                      {s.category && <span className="j-pill j-ghost">{s.category}</span>}
                      {s.project && <span className="j-pill j-proj">{s.project.name}</span>}
                    </div>
                    <p className="j-card-sub">Updated {new Date(s.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="j-row" style={{ gap: 6 }}>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => openEdit(s)} aria-label="Edit">
                      <Icon name="cog" size={14} />
                    </button>
                    <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => remove(s)} aria-label="Delete">
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </div>
                {s.content?.trim() && (
                  <pre style={{
                    whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                    fontFamily: "var(--font-geist-mono, monospace)", fontSize: 12.5,
                    color: "oklch(0.78 0 0)", maxHeight: 200, overflow: "auto",
                  }}>{s.content}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
