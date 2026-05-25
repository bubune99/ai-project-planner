"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"
import { EnvelopePanel } from "@/components/library/EnvelopePanel"
import { formatDistanceToNow } from "date-fns"

interface TemplateStep {
  order: number
  title: string
  skill_ref?: string
  acceptance?: string
  default_prompts?: unknown[]
}

interface DefaultPrompt {
  trigger_event?: string
  body?: string
  version?: number
}

interface FeatureTemplate {
  id: string
  name: string
  title: string
  category: string | null
  description: string
  steps: TemplateStep[]
  requiredSkills: string[]
  defaultAcceptanceCriteria: string[]
  defaultRisks: string[]
  applicableProtocols: string[]
  defaultPrompts: DefaultPrompt[]
  insertionStrategy: string
  parallelismHint: number
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
  status: "active" as FeatureTemplate["status"],
  visibility: "private" as FeatureTemplate["visibility"],
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<FeatureTemplate[]>([])
  const [counts, setCounts] = useState<Counts>({ draft: 0, active: 0, deprecated: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<FeatureTemplate | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyNew)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [promptsOpen, setPromptsOpen] = useState<Record<number, boolean>>({})
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [fieldSaving, setFieldSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      if (filter) qs.set("status", filter)
      if (search.trim()) qs.set("search", search.trim())
      const res = await fetch(`/api/feature-templates?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to load templates")
      setTemplates(json.data || [])
      if (json.meta?.counts) setCounts(json.meta.counts)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load templates")
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const refreshSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/feature-templates/${id}`)
    const json = await res.json()
    if (json.success) {
      setSelected(json.data)
      setTemplates(prev => prev.map(t => t.id === id ? json.data : t))
    }
  }, [])

  const createTemplate = async () => {
    if (!newForm.name.trim()) { setErr("name is required"); return }
    if (!newForm.title.trim()) { setErr("title is required"); return }
    if (!newForm.description.trim()) { setErr("description is required"); return }
    if (!newForm.rationale.trim()) { setErr("rationale is required"); return }
    try {
      setSaving(true)
      const res = await fetch("/api/feature-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Failed to create template")
      setShowNew(false)
      setNewForm(emptyNew)
      await fetchTemplates()
      setSelected(json.data)
      setErr(null)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create template")
    } finally {
      setSaving(false)
    }
  }

  const patchTemplate = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setFieldSaving(true)
    try {
      const res = await fetch(`/api/feature-templates/${id}`, {
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
    await patchTemplate(selected.id, { [field]: value })
    setEditField(null)
  }

  const deprecate = async () => {
    if (!selected) return
    if (!confirm(`Deprecate template "${selected.title}"?`)) return
    await patchTemplate(selected.id, { status: "deprecated" })
  }

  const deleteTemplate = async () => {
    if (!selected) return
    if (!confirm(`Delete template "${selected.title}"?`)) return
    await fetch(`/api/feature-templates/${selected.id}`, { method: "DELETE" })
    setSelected(null)
    await fetchTemplates()
  }

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
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Templates</h1>
              <span className="j-pill j-ghost" style={{ fontSize: 11 }}>{counts.total}</span>
            </div>
          </div>
          <button className="j-btn j-btn-primary" onClick={() => { setShowNew(true); setErr(null) }}>
            <Icon name="plus" size={14} /> New Template
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
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* New Template form */}
        {showNew && (
          <div className="j-card">
            <div className="j-card-head">
              <p className="j-card-title">New Template</p>
              <button className="j-btn j-btn-icon j-btn-ghost" onClick={() => setShowNew(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="j-col" style={{ gap: 10 }}>
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 180 }}
                  placeholder="Slug name * (e.g. stripe-subscription-checkout)"
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
                placeholder="Description * — what this template builds"
                value={newForm.description}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                style={textareaStyle}
              />
              <textarea
                placeholder="Rationale * — why this template belongs in the library"
                value={newForm.rationale}
                rows={2}
                onChange={e => setNewForm(f => ({ ...f, rationale: e.target.value }))}
                style={{ ...textareaStyle, boxShadow: "0 0 0 1px oklch(0.820 0.135 73 / 0.5)" }}
              />
              <div className="j-row j-wrap" style={{ gap: 8 }}>
                <input
                  className="j-search"
                  style={{ flex: 1, minWidth: 140 }}
                  placeholder="Category (e.g. auth, payments, commerce)"
                  value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                />
                <select
                  className="j-search"
                  value={newForm.status}
                  onChange={e => setNewForm(f => ({ ...f, status: e.target.value as FeatureTemplate["status"] }))}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={createTemplate} disabled={saving}>
                  {saving ? "Creating…" : "Create template"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Master + Detail */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Master list */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {loading ? (
              <div className="j-card"><span className="j-muted">Loading…</span></div>
            ) : err && !showNew ? (
              <div className="j-card"><span className="j-muted">{err}</span></div>
            ) : templates.length === 0 ? (
              <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 32 }}>
                <Icon name="layers" size={24} />
                <p className="j-muted" style={{ textAlign: "center", fontSize: 13 }}>
                  No templates yet. Create one to package reusable feature blueprints.
                </p>
              </div>
            ) : (
              <div className="j-col" style={{ gap: 6 }}>
                {templates.map(tmpl => (
                  <div
                    key={tmpl.id}
                    className="j-card j-tight"
                    style={{
                      cursor: "pointer",
                      boxShadow: selected?.id === tmpl.id ? "0 0 0 2px var(--j-accent)" : undefined,
                    }}
                    onClick={() => { setSelected(tmpl); setEditField(null); setPromptsOpen({}) }}
                  >
                    <p className="j-card-title" style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                      {tmpl.title}
                    </p>
                    <div className="j-row j-wrap" style={{ gap: 4 }}>
                      {tmpl.category && (
                        <span className="j-pill j-proj" style={{ fontSize: 10 }}>{tmpl.category}</span>
                      )}
                      <span className={`j-pill ${STATUS_PILL[tmpl.status]}`} style={{ fontSize: 10 }}>
                        {tmpl.status}
                      </span>
                      <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
                        {tmpl.steps.length} steps
                      </span>
                      {tmpl.usageCount > 0 && (
                        <span className="j-pill j-ghost" style={{ fontSize: 10 }}>×{tmpl.usageCount}</span>
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
                          className="j-search"
                          style={{ flex: 1, minWidth: 200, fontSize: 18, fontWeight: 600 }}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveField("title", editValue)
                            if (e.key === "Escape") setEditField(null)
                          }}
                        />
                        <button className="j-btn j-btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => saveField("title", editValue)} disabled={fieldSaving}>
                          {fieldSaving ? "…" : "Save"}
                        </button>
                        <button className="j-btn j-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setEditField(null)}>
                          Cancel
                        </button>
                      </div>
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
                        {selected.insertionStrategy}
                      </span>
                      <span className="j-pill j-ghost" style={{ fontSize: 11 }}>
                        Updated {formatDistanceToNow(new Date(selected.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <button
                    className="j-btn j-btn-icon j-btn-ghost"
                    onClick={() => setSelected(null)}
                    title="Close"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>

                {/* Stats */}
                <div className="j-row j-wrap" style={{ gap: 8, marginTop: 10 }}>
                  <span className="j-pill j-ghost" style={{ fontSize: 11 }}>Used: {selected.usageCount}</span>
                  <span className="j-pill j-pos" style={{ fontSize: 11 }}>Success: {selected.successCount}</span>
                  <span className={`j-pill ${selected.failureCount > 0 ? "j-neg" : "j-ghost"}`} style={{ fontSize: 11 }}>
                    Failures: {selected.failureCount}
                  </span>
                </div>

                <div style={{ marginTop: 14, borderTop: "1px solid var(--j-hairline)", paddingTop: 14 }} />

                {/* Description inline edit */}
                <div className="j-col" style={{ gap: 4 }}>
                  <div className="j-row j-between">
                    <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Description
                    </label>
                    {editField !== "description" && (
                      <button className="j-btn j-btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}
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

                {/* Steps */}
                {selected.steps.length > 0 && (
                  <div className="j-col" style={{ gap: 6, marginTop: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Steps ({selected.steps.length})
                    </label>
                    {selected.steps
                      .slice()
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((step, i) => (
                        <div
                          key={i}
                          style={{ boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8, padding: "10px 12px" }}
                        >
                          <div className="j-row j-wrap" style={{ gap: 8 }}>
                            <span className="j-pill j-ghost" style={{ fontSize: 10 }}>#{step.order ?? i + 1}</span>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{step.title}</p>
                            {step.skill_ref && (
                              <span className="j-pill j-proj" style={{ fontSize: 10 }}>{step.skill_ref}</span>
                            )}
                          </div>
                          {step.acceptance && (
                            <p style={{ margin: "6px 0 0", fontSize: 12, color: "oklch(0.556 0 0)" }}>
                              Acceptance: {step.acceptance}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {/* Required skills chips */}
                {selected.requiredSkills.length > 0 && (
                  <div className="j-row j-wrap" style={{ gap: 4, marginTop: 10 }}>
                    <span className="j-muted" style={{ fontSize: 12 }}>Required skills:</span>
                    {selected.requiredSkills.map(s => (
                      <span key={s} className="j-pill j-proj" style={{ fontSize: 11 }}>{s}</span>
                    ))}
                  </div>
                )}

                {/* Default prompts */}
                {selected.defaultPrompts.length > 0 && (
                  <div className="j-col" style={{ gap: 6, marginTop: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Default prompts ({selected.defaultPrompts.length})
                    </label>
                    {selected.defaultPrompts.map((prompt, i) => (
                      <div key={i} style={{ boxShadow: "0 0 0 1px var(--j-ring)", borderRadius: 8 }}>
                        <button
                          className="j-row j-between"
                          style={{ width: "100%", background: "none", border: "none", padding: "10px 12px", cursor: "pointer", color: "inherit" }}
                          onClick={() => setPromptsOpen(prev => ({ ...prev, [i]: !prev[i] }))}
                        >
                          <div className="j-row" style={{ gap: 8 }}>
                            {prompt.trigger_event && (
                              <span className="j-pill j-warn" style={{ fontSize: 10 }}>{prompt.trigger_event}</span>
                            )}
                            <span style={{ fontSize: 13, color: "oklch(0.860 0 0)" }}>
                              Prompt {i + 1}
                              {prompt.version ? ` (v${prompt.version})` : ""}
                            </span>
                          </div>
                          <Icon name="chevR" size={13} style={{ transform: promptsOpen[i] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" } as React.CSSProperties} />
                        </button>
                        {promptsOpen[i] && prompt.body && (
                          <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--j-ring)" }}>
                            <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "oklch(0.860 0 0)", fontFamily: "monospace" }}>
                              {prompt.body}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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
                    onClick={deleteTemplate}
                    disabled={fieldSaving}
                  >
                    <Icon name="x" size={13} /> Delete
                  </button>
                </div>
              </div>

              <EnvelopePanel
                envelope={selected.documentation5wh}
                onSave={async (patch) => {
                  await patchTemplate(selected.id, patch)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
