"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"
import { EnvelopePanel } from "@/components/library/EnvelopePanel"
import { formatDistanceToNow } from "date-fns"

interface Skill {
  id: string
  name: string
  title: string
  category: string | null
  description: string
  whenToUse: string | null
  body: string
  prerequisites: string[]
  provides: string[]
  status: "draft" | "active" | "deprecated"
  version: number
  usageCount: number
  successCount: number
  failureCount: number
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

const STATUSES = ["active", "draft", "deprecated"] as const

const emptyNew = {
  name: "",
  title: "",
  description: "",
  rationale: "",
  category: "",
  whenToUse: "",
  body: "",
  status: "active" as Skill["status"],
  visibility: "private" as Skill["visibility"],
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [counts, setCounts] = useState<Counts>({ draft: 0, active: 0, deprecated: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Skill | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyNew)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Inline edit state for the detail pane
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [fieldSaving, setFieldSaving] = useState(false)

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (filter) qs.set("status", filter)
      if (search.trim()) qs.set("search", search.trim())
      const res = await fetch(`/api/skills?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to load skills")
      setSkills(json.data || [])
      if (json.meta?.counts) setCounts(json.meta.counts)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load skills")
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  // Refresh selected after mutations
  const refreshSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/skills/${id}`)
    const json = await res.json()
    if (json.success) {
      setSelected(json.data)
      setSkills(prev => prev.map(s => s.id === id ? json.data : s))
    }
  }, [])

  const createSkill = async () => {
    if (!newForm.name.trim()) { setErr("name is required"); return }
    if (!newForm.title.trim()) { setErr("title is required"); return }
    if (!newForm.description.trim()) { setErr("description is required"); return }
    if (!newForm.rationale.trim()) { setErr("rationale is required"); return }
    try {
      setSaving(true)
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to create skill")
      setShowNew(false)
      setNewForm(emptyNew)
      await fetchSkills()
      setSelected(json.data)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create skill")
    } finally {
      setSaving(false)
    }
  }

  const patchSkill = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setFieldSaving(true)
    try {
      const res = await fetch(`/api/skills/${id}`, {
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
    await patchSkill(selected.id, { [field]: value })
    setEditField(null)
  }

  const deprecate = async () => {
    if (!selected) return
    if (!confirm(`Deprecate skill "${selected.title}"?`)) return
    await patchSkill(selected.id, { status: "deprecated" })
  }

  const deleteSkill = async () => {
    if (!selected) return
    if (!confirm(`Permanently delete skill "${selected.title}"? This cannot be undone.`)) return
    await fetch(`/api/skills/${selected.id}`, { method: "DELETE" })
    setSelected(null)
    await fetchSkills()
  }

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Header */}
        <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
          <div className="j-col" style={{ gap: 2 }}>
            <div className="j-row" style={{ gap: 8 }}>
              <span className="j-muted" style={{ fontSize: 13 }}>
                <a href="/library" style={{ color: "oklch(0.556 0 0)", textDecoration: "none" }}>Library</a>
                {" / "}
              </span>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Skills</h1>
              <span className="j-pill j-ghost" style={{ fontSize: 11 }}>{counts.total}</span>
            </div>
          </div>
          <button className="j-btn j-btn-primary" onClick={() => { setShowNew(true); setErr(null) }}>
            <Icon name="plus" size={14} /> New Skill
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
            placeholder="Search skills…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* New Skill form */}
        {showNew && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">New Skill</p>
              <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setShowNew(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="j-col" style={{ gap: 10 }}>
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  placeholder="Slug name * (e.g. drizzle-migration)"
                  value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  placeholder="Display title *"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <textarea
                placeholder="Description * — what this skill covers"
                value={newForm.description}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                style={textareaStyle}
              />
              <textarea
                placeholder="Rationale * — why this skill should exist in the library"
                value={newForm.rationale}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, rationale: e.target.value }))}
                style={{ ...textareaStyle, boxShadow: "0 0 0 1px oklch(0.820 0.135 73 / 0.5)" }}
              />
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 140 }}
                  placeholder="Category (e.g. database, api, auth)"
                  value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                />
                <select
                  className="j-search"
                  value={newForm.status}
                  onChange={e => setNewForm(f => ({ ...f, status: e.target.value as Skill["status"] }))}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={createSkill} disabled={saving}>
                  {saving ? "Creating…" : "Create skill"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Master + Detail layout */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Master list */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {loading ? (
              <div className="j-card"><span className="j-muted">Loading…</span></div>
            ) : err && !showNew ? (
              <div className="j-card"><span className="j-muted">{err}</span></div>
            ) : skills.length === 0 ? (
              <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 32 }}>
                <Icon name="bolt" size={24} />
                <p className="j-muted" style={{ textAlign: "center", fontSize: 13 }}>
                  No skills yet. Create one to start building your library.
                </p>
              </div>
            ) : (
              <div className="j-col" style={{ gap: 6 }}>
                {skills.map(skill => (
                  <div
                    key={skill.id}
                    className="j-card j-tight"
                    style={{
                      cursor: "pointer",
                      boxShadow: selected?.id === skill.id
                        ? "0 0 0 2px var(--j-accent)"
                        : undefined,
                    }}
                    onClick={() => { setSelected(skill); setEditField(null) }}
                  >
                    <div className="j-row j-between" style={{ gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <p
                          className="j-card-title"
                          style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}
                        >
                          {skill.title}
                        </p>
                        <div className="j-row j-wrap" style={{ gap: 4 }}>
                          {skill.category && (
                            <span className="j-pill j-proj" style={{ fontSize: 10 }}>{skill.category}</span>
                          )}
                          <span className={`j-pill ${STATUS_PILL[skill.status]}`} style={{ fontSize: 10 }}>
                            {skill.status}
                          </span>
                          {skill.usageCount > 0 && (
                            <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
                              ×{skill.usageCount}
                            </span>
                          )}
                        </div>
                      </div>
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
                {/* Title + meta */}
                <div className="j-card-head">
                  <div className="j-col" style={{ gap: 4, flex: 1 }}>
                    {editField === "title" ? (
                      <InlineEdit
                        value={editValue}
                        onChange={setEditValue}
                        onSave={() => saveField("title", editValue)}
                        onCancel={() => setEditField(null)}
                        saving={fieldSaving}
                        inputStyle={{ fontSize: 18, fontWeight: 600 }}
                      />
                    ) : (
                      <div
                        className="j-row"
                        style={{ gap: 8, cursor: "text" }}
                        onClick={() => { setEditField("title"); setEditValue(selected.title) }}
                        title="Click to edit title"
                      >
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selected.title}</h2>
                        <Icon name="cog" size={13} style={{ opacity: 0.4 } as React.CSSProperties} />
                      </div>
                    )}
                    <div className="j-row j-wrap" style={{ gap: 6 }}>
                      {selected.category && (
                        <span className="j-pill j-proj" style={{ fontSize: 11 }}>{selected.category}</span>
                      )}
                      <span className={`j-pill ${STATUS_PILL[selected.status]}`} style={{ fontSize: 11 }}>
                        {selected.status}
                      </span>
                      <span className="j-pill j-ghost" style={{ fontSize: 11 }}>v{selected.version}</span>
                      <span className="j-pill j-ghost" style={{ fontSize: 11 }}>
                        Updated {formatDistanceToNow(new Date(selected.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="j-row" style={{ gap: 6 }}>
                    <button
                      className="j-btn j-btn-icon j-btn-ghost"
                      onClick={() => setSelected(null)}
                      title="Close detail"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="j-row j-wrap" style={{ gap: 8, marginTop: 10 }}>
                  <StatChip label="Used" value={selected.usageCount} colorClass="j-ghost" />
                  <StatChip label="Success" value={selected.successCount} colorClass="j-pos" />
                  <StatChip label="Failures" value={selected.failureCount} colorClass={selected.failureCount > 0 ? "j-neg" : "j-ghost"} />
                  <span className="j-muted" style={{ fontSize: 12 }}>
                    Created {formatDistanceToNow(new Date(selected.createdAt), { addSuffix: true })}
                  </span>
                </div>

                <div style={{ marginTop: 14, borderTop: "1px solid var(--j-hairline)", paddingTop: 14 }} />

                {/* Description */}
                <EditableTextArea
                  label="Description"
                  field="description"
                  value={selected.description}
                  editField={editField}
                  editValue={editValue}
                  saving={fieldSaving}
                  onStartEdit={(f, v) => { setEditField(f); setEditValue(v) }}
                  onSave={saveField}
                  onCancel={() => setEditField(null)}
                  setEditValue={setEditValue}
                />

                {/* Body */}
                <EditableTextArea
                  label="Instruction body"
                  field="body"
                  value={selected.body || "(empty)"}
                  editField={editField}
                  editValue={editValue}
                  saving={fieldSaving}
                  onStartEdit={(f, v) => { setEditField(f); setEditValue(v === "(empty)" ? "" : v) }}
                  onSave={saveField}
                  onCancel={() => setEditField(null)}
                  setEditValue={setEditValue}
                  rows={6}
                  mono
                />

                {/* Provides / prerequisites chips */}
                {(selected.provides.length > 0 || selected.prerequisites.length > 0) && (
                  <div className="j-col" style={{ gap: 6, marginTop: 10 }}>
                    {selected.provides.length > 0 && (
                      <div className="j-row j-wrap" style={{ gap: 4 }}>
                        <span className="j-muted" style={{ fontSize: 12 }}>Provides:</span>
                        {selected.provides.map(p => (
                          <span key={p} className="j-pill j-pos" style={{ fontSize: 11 }}>{p}</span>
                        ))}
                      </div>
                    )}
                    {selected.prerequisites.length > 0 && (
                      <div className="j-row j-wrap" style={{ gap: 4 }}>
                        <span className="j-muted" style={{ fontSize: 12 }}>Requires:</span>
                        {selected.prerequisites.map(p => (
                          <span key={p} className="j-pill j-proj" style={{ fontSize: 11 }}>{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="j-row j-wrap" style={{ gap: 8, marginTop: 14 }}>
                  {selected.status !== "deprecated" && (
                    <button
                      className="j-btn j-btn-ghost"
                      style={{ fontSize: 13 }}
                      onClick={deprecate}
                      disabled={fieldSaving}
                    >
                      <Icon name="archive" size={13} /> Deprecate
                    </button>
                  )}
                  <button
                    className="j-btn j-btn-ghost"
                    style={{ fontSize: 13, color: "var(--j-neg)" }}
                    onClick={deleteSkill}
                    disabled={fieldSaving}
                  >
                    <Icon name="x" size={13} /> Delete
                  </button>
                </div>
              </div>

              {/* Envelope panel */}
              <EnvelopePanel
                envelope={selected.documentation5wh}
                onSave={async (patch) => {
                  await patchSkill(selected.id, patch)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "oklch(1 0 0 / 0.04)",
  color: "oklch(0.985 0 0)",
  border: "none",
  boxShadow: "0 0 0 1px var(--j-ring)",
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
  resize: "vertical",
  fontFamily: "inherit",
}

function StatChip({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <span className={`j-pill ${colorClass}`} style={{ fontSize: 11 }}>
      {label}: {value}
    </span>
  )
}

interface InlineEditProps {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  inputStyle?: React.CSSProperties
}

function InlineEdit({ value, onChange, onSave, onCancel, saving, inputStyle }: InlineEditProps) {
  return (
    <div className="j-row" style={{ gap: 6, flexWrap: "wrap" }}>
      <input
        autoFocus
        className="j-search"
        style={{ flex: 1, minWidth: 200, ...inputStyle }}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") onSave()
          if (e.key === "Escape") onCancel()
        }}
      />
      <button className="j-btn j-btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={onSave} disabled={saving}>
        {saving ? "…" : "Save"}
      </button>
      <button className="j-btn j-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

interface EditableTextAreaProps {
  label: string
  field: string
  value: string
  editField: string | null
  editValue: string
  saving: boolean
  rows?: number
  mono?: boolean
  onStartEdit: (field: string, value: string) => void
  onSave: (field: string, value: string) => void
  onCancel: () => void
  setEditValue: (v: string) => void
}

function EditableTextArea({
  label, field, value, editField, editValue, saving, rows = 3,
  mono, onStartEdit, onSave, onCancel, setEditValue,
}: EditableTextAreaProps) {
  const isEditing = editField === field
  return (
    <div className="j-col" style={{ gap: 4, marginTop: 10 }}>
      <div className="j-row j-between">
        <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </label>
        {!isEditing && (
          <button
            className="j-btn j-btn-ghost"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={() => onStartEdit(field, value)}
          >
            <Icon name="cog" size={11} /> Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="j-col" style={{ gap: 6 }}>
          <textarea
            autoFocus
            rows={rows}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            style={{ ...textareaStyle, fontFamily: mono ? "monospace" : "inherit" }}
          />
          <div className="j-row" style={{ gap: 6 }}>
            <button className="j-btn j-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => onSave(field, editValue)} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="j-btn j-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: value && value !== "(empty)" ? "oklch(0.860 0 0)" : "oklch(0.556 0 0)",
            fontFamily: mono ? "monospace" : "inherit",
            whiteSpace: "pre-wrap",
            cursor: "text",
          }}
          onClick={() => onStartEdit(field, value === "(empty)" ? "" : value)}
          title="Click to edit"
        >
          {value}
        </p>
      )}
    </div>
  )
}
