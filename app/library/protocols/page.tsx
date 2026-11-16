"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"
import { EnvelopePanel } from "@/components/library/EnvelopePanel"
import { formatDistanceToNow } from "date-fns"

interface Protocol {
  id: string
  name: string
  title: string
  category: string | null
  description: string
  triggerEvent: string
  ruleBody: string
  violationSeverity: "info" | "warning" | "error" | "fatal"
  autoAction: string | null
  appliesToTypes: string[]
  appliesToCategories: string[]
  status: "draft" | "active" | "deprecated"
  version: number
  triggeredCount: number
  violatedCount: number
  blockedCount: number
  visibility: "private" | "project" | "public"
  documentation5wh: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type Counts = { draft: number; active: number; deprecated: number; total: number }

const STATUS_PILL: Record<string, string> = {
  active: "j-pos",
  draft: "j-warn",
  deprecated: "j-muted",
}

const SEVERITY_PILL: Record<string, string> = {
  info: "j-info",
  warning: "j-warn",
  error: "j-neg",
  fatal: "j-neg",
}

const STATUSES = ["active", "draft", "deprecated"] as const
const SEVERITIES = ["info", "warning", "error", "fatal"] as const

const emptyNew = {
  name: "",
  title: "",
  description: "",
  triggerEvent: "",
  ruleBody: "",
  rationale: "",
  category: "",
  violationSeverity: "warning" as Protocol["violationSeverity"],
  status: "active" as Protocol["status"],
  visibility: "private" as Protocol["visibility"],
}

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [counts, setCounts] = useState<Counts>({ draft: 0, active: 0, deprecated: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Protocol | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyNew)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [fieldSaving, setFieldSaving] = useState(false)

  const listSeq = useRef(0)
  const fetchProtocols = useCallback(async () => {
    // Only the newest request may fill the list: an older answer arriving late must not replace it.
    const mine = ++listSeq.current
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (filter) qs.set("status", filter)
      if (search.trim()) qs.set("search", search.trim())
      const res = await fetch(`/api/protocols?${qs.toString()}`)
      const json = await res.json()
      if (mine !== listSeq.current) return
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to load protocols")
      setProtocols(json.data || [])
      if (json.meta?.counts) setCounts(json.meta.counts)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load protocols")
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchProtocols() }, [fetchProtocols])

  const refreshSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/protocols/${id}`)
    const json = await res.json()
    if (json.success) {
      setSelected(json.data)
      setProtocols(prev => prev.map(p => p.id === id ? json.data : p))
    }
  }, [])

  const createProtocol = async () => {
    if (!newForm.name.trim()) { setErr("Give it a slug name first."); return }
    if (!newForm.title.trim()) { setErr("Give it a display title first."); return }
    if (!newForm.description.trim()) { setErr("Add a description first."); return }
    if (!newForm.triggerEvent.trim()) { setErr("Say which event triggers it first."); return }
    if (!newForm.ruleBody.trim()) { setErr("Write the rule body first."); return }
    if (!newForm.rationale.trim()) { setErr("Say why it belongs in the library first (rationale)."); return }
    try {
      setSaving(true)
      const res = await fetch("/api/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to create protocol")
      setShowNew(false)
      setNewForm(emptyNew)
      await fetchProtocols()
      setSelected(json.data)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create protocol")
    } finally {
      setSaving(false)
    }
  }

  const patchProtocol = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setFieldSaving(true)
    try {
      const res = await fetch(`/api/protocols/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Save failed")
      await refreshSelected(id)
    } finally {
      setFieldSaving(false)
    }
  }, [refreshSelected])

  const saveField = async (field: string, value: string) => {
    if (!selected) return
    try {
      await patchProtocol(selected.id, { [field]: value })
      setEditField(null)
    } catch (e: unknown) {
      // The field stays open with what was typed, and the reason is said.
      toast.error(e instanceof Error ? e.message : "The change was not saved")
    }
  }

  const deprecate = async () => {
    if (!selected) return
    if (!confirm(`Deprecate protocol "${selected.title}"?`)) return
    try {
      await patchProtocol(selected.id, { status: "deprecated" })
      toast.success("Deprecated")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "The change was not saved")
    }
  }

  const deleteProtocol = async () => {
    if (!selected) return
    if (!confirm(`Delete protocol "${selected.title}"?`)) return
    const res = await fetch(`/api/protocols/${selected.id}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) { toast.error("The protocol was not deleted"); return }
    toast.success("Deleted")
    setSelected(null)
    await fetchProtocols()
  }

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--opx-soft)",
    color: "var(--opx-ink)",
    border: "none",
    boxShadow: "0 0 0 1px var(--j-ring)",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    resize: "vertical",
    fontFamily: "inherit",
  }

  return (
    <DashboardLayout>
      <div className="j-content opx-mdc">
        {/* Header */}
        <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
          <div className="j-col" style={{ gap: 2 }}>
            <div className="j-row" style={{ gap: 8 }}>
              <span className="j-muted" style={{ fontSize: 13 }}>
                <a href="/library" style={{ color: "var(--opx-muted)", textDecoration: "underline", display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 4px" }}>Library</a>
                {" / "}
              </span>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Protocols</h1>
              <span className="j-pill j-ghost" style={{ fontSize: 12 }}>{counts.total}</span>
            </div>
          </div>
          <button className="j-btn j-btn-primary" onClick={() => { setShowNew(true); setErr(null) }}>
            <Icon name="plus" size={14} /> New Protocol
          </button>
        </div>

        {/* Filters */}
        <div className="j-row j-wrap" style={{ gap: 8 }}>
          <select className="opx-input opx-afilter" aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
            <option value="">Status: all</option>
            {STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input
            className="j-search"
            style={{ minWidth: 220 }}
            aria-label="Search protocols"
            placeholder="Search protocols…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* New Protocol form */}
        {showNew && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">New Protocol</p>
              <button className="j-btn j-btn-icon j-btn-ghost" aria-label="Close" onClick={() => setShowNew(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="j-col" style={{ gap: 10 }}>
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  aria-label="Slug name" placeholder="Slug name * (e.g. always-validate-migration-safety)"
                  value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  aria-label="Display title" placeholder="Display title *"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <textarea
                aria-label="Description" placeholder="Description * — what this protocol enforces"
                value={newForm.description}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                style={textareaStyle}
              />
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  aria-label="Trigger event" placeholder="Trigger event * (e.g. before_migration, before_deploy)"
                  value={newForm.triggerEvent}
                  onChange={e => setNewForm(f => ({ ...f, triggerEvent: e.target.value }))}
                />
                <select
                  className="j-search"
                  value={newForm.violationSeverity}
                  onChange={e => setNewForm(f => ({ ...f, violationSeverity: e.target.value as Protocol["violationSeverity"] }))}
                >
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <textarea
                aria-label="Rule body" placeholder="Rule body * — the enforcement text / prompt that fires at trigger_event"
                value={newForm.ruleBody}
                rows={4}
                onChange={e => setNewForm(f => ({ ...f, ruleBody: e.target.value }))}
                style={{ ...textareaStyle, fontFamily: "inherit" }}
              />
              <textarea
                aria-label="Rationale" placeholder="Rationale * — why this protocol is in the library"
                value={newForm.rationale}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, rationale: e.target.value }))}
                style={{ ...textareaStyle, boxShadow: "0 0 0 1px color-mix(in srgb, var(--opx-warn) 50%, transparent)" }}
              />
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 140 }}
                  aria-label="Category" placeholder="Category (e.g. security, data-integrity, deployment)"
                  value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                />
                <select
                  className="j-search"
                  aria-label="Status"
                  value={newForm.status}
                  onChange={e => setNewForm(f => ({ ...f, status: e.target.value as Protocol["status"] }))}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={createProtocol} disabled={saving}>
                  {saving ? "Creating…" : "Create protocol"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Master + Detail */}
        <div className={`opx-md${selected ? " has-sel" : ""}`}>
          {/* Master list */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {loading && protocols.length === 0 ? (
              <div className="j-card"><span className="j-muted">Loading…</span></div>
            ) : err && !showNew ? (
              <div className="j-card"><span className="j-muted">{err}</span></div>
            ) : protocols.length === 0 ? (
              <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 32 }}>
                <Icon name="shield" size={24} />
                <p className="j-muted" style={{ textAlign: "center", fontSize: 13 }}>
                  {filter || search.trim() ? "No protocols match these filters." : "No protocols yet. Create one to enforce rules at key trigger events."}
                </p>
              </div>
            ) : (
              <div className="j-col" style={{ gap: 6 }}>
                {protocols.map(proto => (
                  <div
                    key={proto.id}
                    className="j-card j-tight"
                    role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.currentTarget.click() } }}
                    style={{
                      cursor: "pointer",
                      boxShadow: selected?.id === proto.id ? "0 0 0 2px var(--j-accent)" : undefined,
                    }}
                    onClick={() => { setSelected(proto); setEditField(null) }}
                  >
                    <p className="j-card-title" style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                      {proto.title}
                    </p>
                    <div className="j-row j-wrap" style={{ gap: 4 }}>
                      {proto.category && (
                        <span className="j-pill j-proj" style={{ fontSize: 12 }}>{proto.category}</span>
                      )}
                      <span className={`j-pill ${STATUS_PILL[proto.status]}`} style={{ fontSize: 12 }}>
                        {proto.status}
                      </span>
                      <span className={`j-pill ${SEVERITY_PILL[proto.violationSeverity]}`} style={{ fontSize: 12 }}>
                        {proto.violationSeverity}
                      </span>
                      {proto.triggeredCount > 0 && (
                        <span className="j-pill j-ghost" style={{ fontSize: 12 }}>
                          ×{proto.triggeredCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail pane */}
          {selected && (
            <div className="j-col" style={{ flex: 1, gap: 10, minWidth: 0 }}>
              <div className="j-card">
                <div className="j-card-head">
                  <div className="j-col" style={{ gap: 4, flex: 1 }}>
                    {editField === "title" ? (
                      <div className="j-row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <input
                          autoFocus
                          aria-label="New value"
                          className="j-search"
                          style={{ flex: 1, minWidth: 200, fontSize: 18, fontWeight: 600 }}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveField("title", editValue)
                            if (e.key === "Escape") setEditField(null)
                          }}
                        />
                        <button className="j-btn j-btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => saveField("title", editValue)} disabled={fieldSaving}>
                          {fieldSaving ? "…" : "Save"}
                        </button>
                        <button className="j-btn j-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                          onClick={() => setEditField(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div
                        className="j-row"
                        style={{ gap: 8, cursor: "text" }}
                        onClick={() => { setEditField("title"); setEditValue(selected.title) }}
                        title="Click to edit title"
                        role="button" tabIndex={0} aria-label="Edit the title" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click() } }}
                      >
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selected.title}</h2>
                        <Icon name="cog" size={13} style={{ opacity: 0.4 } as React.CSSProperties} />
                      </div>
                    )}
                    <div className="j-row j-wrap" style={{ gap: 6 }}>
                      {/* Prominent protocol meta */}
                      <span className="j-pill j-info" style={{ fontSize: 12 }}>
                        trigger: {selected.triggerEvent}
                      </span>
                      <span className={`j-pill ${SEVERITY_PILL[selected.violationSeverity]}`} style={{ fontSize: 12 }}>
                        {selected.violationSeverity}
                      </span>
                      {selected.autoAction && (
                        <span className="j-pill j-ghost" style={{ fontSize: 12 }}>
                          auto: {selected.autoAction}
                        </span>
                      )}
                      <span className={`j-pill ${STATUS_PILL[selected.status]}`} style={{ fontSize: 12 }}>
                        {selected.status}
                      </span>
                      <span className="j-pill j-ghost" style={{ fontSize: 12 }}>v{selected.version}</span>
                      <span className="j-pill j-ghost" style={{ fontSize: 12 }}>
                        Updated {formatDistanceToNow(new Date(selected.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setSelected(null)} title="Close">
                    <Icon name="x" size={14} />
                  </button>
                </div>

                {/* Stats */}
                <div className="j-row j-wrap" style={{ gap: 8, marginTop: 10 }}>
                  <span className="j-pill j-ghost" style={{ fontSize: 12 }}>Triggered: {selected.triggeredCount}</span>
                  <span className={`j-pill ${selected.violatedCount > 0 ? "j-warn" : "j-ghost"}`} style={{ fontSize: 12 }}>
                    Violated: {selected.violatedCount}
                  </span>
                  <span className={`j-pill ${selected.blockedCount > 0 ? "j-neg" : "j-ghost"}`} style={{ fontSize: 12 }}>
                    Blocked: {selected.blockedCount}
                  </span>
                </div>

                {/* Applies-to chips */}
                {(selected.appliesToTypes.length > 0 || selected.appliesToCategories.length > 0) && (
                  <div className="j-row j-wrap" style={{ gap: 4, marginTop: 10 }}>
                    {selected.appliesToTypes.length > 0 && (
                      <>
                        <span className="j-muted" style={{ fontSize: 12 }}>Types:</span>
                        {selected.appliesToTypes.map(t => (
                          <span key={t} className="j-pill j-proj" style={{ fontSize: 12 }}>{t}</span>
                        ))}
                      </>
                    )}
                    {selected.appliesToCategories.length > 0 && (
                      <>
                        <span className="j-muted" style={{ fontSize: 12, marginLeft: 4 }}>Categories:</span>
                        {selected.appliesToCategories.map(c => (
                          <span key={c} className="j-pill j-ghost" style={{ fontSize: 12 }}>{c}</span>
                        ))}
                      </>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 14, borderTop: "1px solid var(--j-hairline)", paddingTop: 14 }} />

                {/* Description inline edit */}
                <div className="j-col" style={{ gap: 4 }}>
                  <div className="j-row j-between">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--opx-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Description
                    </label>
                    {editField !== "description" && (
                      <button className="j-btn j-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => { setEditField("description"); setEditValue(selected.description) }}>
                        <Icon name="cog" size={11} /> Edit
                      </button>
                    )}
                  </div>
                  {editField === "description" ? (
                    <div className="j-col" style={{ gap: 6 }}>
                      <textarea autoFocus rows={3} value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        style={textareaStyle} />
                      <div className="j-row" style={{ gap: 6 }}>
                        <button className="j-btn j-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}
                          onClick={() => saveField("description", editValue)} disabled={fieldSaving}>
                          {fieldSaving ? "Saving…" : "Save"}
                        </button>
                        <button className="j-btn j-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => setEditField(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, cursor: "text" }}
                      onClick={() => { setEditField("description"); setEditValue(selected.description) }}>
                      {selected.description}
                    </p>
                  )}
                </div>

                {/* Rule body inline edit */}
                <div className="j-col" style={{ gap: 4, marginTop: 12 }}>
                  <div className="j-row j-between">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--opx-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Rule body
                    </label>
                    {editField !== "ruleBody" && (
                      <button className="j-btn j-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => { setEditField("ruleBody"); setEditValue(selected.ruleBody) }}>
                        <Icon name="cog" size={11} /> Edit
                      </button>
                    )}
                  </div>
                  {editField === "ruleBody" ? (
                    <div className="j-col" style={{ gap: 6 }}>
                      <textarea autoFocus rows={6} value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        style={{ ...textareaStyle, fontFamily: "inherit" }} />
                      <div className="j-row" style={{ gap: 6 }}>
                        <button className="j-btn j-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }}
                          onClick={() => saveField("ruleBody", editValue)} disabled={fieldSaving}>
                          {fieldSaving ? "Saving…" : "Save"}
                        </button>
                        <button className="j-btn j-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => setEditField(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <pre
                      style={{ margin: 0, fontSize: 12, lineHeight: 1.6, fontFamily: "inherit", whiteSpace: "pre-wrap", cursor: "text", color: "var(--opx-ink)" }}
                      onClick={() => { setEditField("rule_body"); setEditValue(selected.ruleBody) }}
                    >
                      {selected.ruleBody || "(empty)"}
                    </pre>
                  )}
                </div>

                {/* Actions */}
                <div className="j-row j-wrap" style={{ gap: 8, marginTop: 14 }}>
                  {selected.status !== "deprecated" && (
                    <button className="j-btn j-btn-ghost" style={{ fontSize: 13 }} onClick={deprecate} disabled={fieldSaving}>
                      <Icon name="archive" size={13} /> Deprecate
                    </button>
                  )}
                  <button
                    className="j-btn j-btn-ghost"
                    style={{ fontSize: 13, color: "var(--j-neg)" }}
                    onClick={deleteProtocol}
                    disabled={fieldSaving}
                  >
                    <Icon name="x" size={13} /> Delete
                  </button>
                </div>
              </div>

              <EnvelopePanel
                envelope={selected.documentation5wh}
                onSave={async (patch) => {
                  await patchProtocol(selected.id, patch)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
