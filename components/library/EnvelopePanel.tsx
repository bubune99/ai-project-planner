"use client"

import { useState } from "react"
import { Icon } from "@/components/jarvis/icons"

interface Dim5WH {
  who?: string | Record<string, unknown>
  what?: string | Record<string, unknown>
  when?: string | Record<string, unknown>
  where?: string | Record<string, unknown>
  why?: string | Record<string, unknown> | { rationale?: string; motivation?: string }
  how?: string | Record<string, unknown>
}

function extractText(val: unknown): string {
  if (!val) return ""
  if (typeof val === "string") return val
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>
    // Try common sub-keys first
    const candidates = ["rationale", "summary", "description", "motivation", "notes", "text", "value"]
    for (const key of candidates) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key] as string
    }
    // Fallback: join all string values
    return Object.values(obj)
      .filter(v => typeof v === "string" && v)
      .join(" · ")
      .slice(0, 400)
  }
  return String(val)
}

const DIMS: { key: keyof Dim5WH; label: string; color: string }[] = [
  { key: "who",   label: "Who",   color: "j-proj"  },
  { key: "what",  label: "What",  color: "j-ghost" },
  { key: "when",  label: "When",  color: "j-warn"  },
  { key: "where", label: "Where", color: "j-ghost" },
  { key: "why",   label: "Why",   color: "j-pos"   },
  { key: "how",   label: "How",   color: "j-info"  },
]

interface EditForm {
  who: string
  what: string
  when: string
  where: string
  why: string
  how: string
}

interface EnvelopePanelProps {
  envelope: Record<string, unknown> | null | undefined
  onSave?: (patch: { documentation_5wh: Partial<Dim5WH> }) => Promise<void>
}

export function EnvelopePanel({ envelope, onSave }: EnvelopePanelProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditForm>({ who: "", what: "", when: "", where: "", why: "", how: "" })

  const env = (envelope || {}) as Dim5WH

  const startEdit = () => {
    setForm({
      who:   extractText(env.who),
      what:  extractText(env.what),
      when:  extractText(env.when),
      where: extractText(env.where),
      why:   extractText(env.why),
      how:   extractText(env.how),
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = async () => {
    if (!onSave) return
    try {
      setSaving(true)
      await onSave({
        documentation_5wh: {
          who:   form.who   || undefined,
          what:  form.what  || undefined,
          when:  form.when  || undefined,
          where: form.where || undefined,
          why:   form.why   ? { rationale: form.why } : undefined,
          how:   form.how   || undefined,
        },
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="j-card j-tight" style={{ marginTop: 2 }}>
      {/* Header */}
      <div className="j-row j-between" style={{ gap: 8 }}>
        <div className="j-row" style={{ gap: 8 }}>
          <button
            className="j-btn j-btn-ghost"
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
          >
            <Icon name={open ? "chevR" : "chevR"} size={12} style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" } as React.CSSProperties} />
            <span style={{ marginLeft: 4 }}>5W+H Envelope</span>
          </button>
          {!open && (
            <span className="j-muted" style={{ fontSize: 12 }}>
              {DIMS.filter(d => extractText(env[d.key])).length} / 6 dimensions populated
            </span>
          )}
        </div>
        {open && onSave && !editing && (
          <button
            className="j-btn j-btn-ghost"
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={startEdit}
          >
            <Icon name="cog" size={12} /> Edit envelope
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {editing ? (
            <div className="j-col" style={{ gap: 8 }}>
              {DIMS.map(dim => (
                <div key={dim.key} className="j-col" style={{ gap: 3 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {dim.label}
                  </label>
                  <textarea
                    value={form[dim.key]}
                    rows={2}
                    placeholder={`(${dim.label.toLowerCase()} dimension — not provided)`}
                    onChange={e => setForm(f => ({ ...f, [dim.key]: e.target.value }))}
                    style={{
                      width: "100%",
                      background: "oklch(1 0 0 / 0.04)",
                      color: "oklch(0.985 0 0)",
                      border: "none",
                      boxShadow: "0 0 0 1px var(--j-ring)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 13,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              ))}
              <div className="j-row" style={{ gap: 8 }}>
                <button className="j-btn j-btn-primary" onClick={saveEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save envelope"}
                </button>
                <button className="j-btn j-btn-ghost" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 8,
              }}
            >
              {DIMS.map(dim => {
                const text = extractText(env[dim.key])
                return (
                  <div
                    key={dim.key}
                    style={{
                      boxShadow: "0 0 0 1px var(--j-ring)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div className="j-row" style={{ gap: 6, marginBottom: 4 }}>
                      <span className={`j-pill ${dim.color}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                        {dim.label}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: text ? "oklch(0.860 0 0)" : "oklch(0.556 0 0)" }}>
                      {text || "(not provided)"}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
