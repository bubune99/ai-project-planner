"use client"

/**
 * CrossLinkPanel — Phase 5 / Idea F2 cross-link UI.
 *
 * Reusable panel that shows + manages entity_relations FROM a given entity.
 * Lists existing links, allows creating new ones, deleting old ones.
 *
 * Drop into any entity detail page:
 *   <CrossLinkPanel fromEntityType="idea" fromEntityId={idea.id} />
 */

import { useCallback, useEffect, useState } from "react"
import { Plus, X, ArrowRight, AlertCircle, Search } from "lucide-react"

type Relation = {
  id: string
  fromType: string
  fromId: string
  toType: string
  toId: string
  relationType: string
  confidence: number
  createdAt: string
}

const RELATION_TYPES = [
  "supersedes",
  "derives_from",
  "related_to",
  "conflicts_with",
  "implements",
  "blocks",
  "part_of",
  "references",
  "promoted_from",
  "addresses",
  "inspired_by",
] as const

const COMMON_ENTITY_TYPES = [
  "idea",
  "todo",
  "project",
  "sop",
  "decision",
  "feature_template",
  "skill",
  "protocol",
  "work_order",
  "prompt",
  "client",
  "feedback",
] as const

interface CrossLinkPanelProps {
  fromEntityType: string
  fromEntityId: string
  className?: string
}

export function CrossLinkPanel({
  fromEntityType,
  fromEntityId,
  className,
}: CrossLinkPanelProps) {
  const [relations, setRelations] = useState<Relation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newRel, setNewRel] = useState({
    toType: "idea",
    toId: "",
    relationType: "related_to" as (typeof RELATION_TYPES)[number],
    rationale: "",
  })
  const [searchQ, setSearchQ] = useState("")
  const [searchResults, setSearchResults] = useState<
    Array<{ entity_type: string; entity_id: string; title: string }>
  >([])

  const fetchRelations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch both directions
      const [fromRes, toRes] = await Promise.all([
        fetch(`/api/entity-relations?fromType=${fromEntityType}&fromId=${fromEntityId}`),
        fetch(`/api/entity-relations?toType=${fromEntityType}&toId=${fromEntityId}`),
      ])
      const fromJson = await fromRes.json()
      const toJson = await toRes.json()
      const merged: Relation[] = []
      if (fromJson.success) merged.push(...fromJson.data)
      if (toJson.success) merged.push(...toJson.data)
      setRelations(merged)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load relations")
    } finally {
      setLoading(false)
    }
  }, [fromEntityType, fromEntityId])

  useEffect(() => {
    fetchRelations()
  }, [fetchRelations])

  // Envelope search to find targets
  const runSearch = useCallback(async () => {
    if (!searchQ.trim()) {
      setSearchResults([])
      return
    }
    try {
      const r = await fetch(`/api/envelope-search?q=${encodeURIComponent(searchQ)}&limit=10`)
      const j = await r.json()
      if (j.success) setSearchResults(j.data)
    } catch {
      // ignore
    }
  }, [searchQ])

  const createRelation = async () => {
    if (!newRel.toType || !newRel.toId || !newRel.relationType) return
    try {
      const r = await fetch("/api/entity-relations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromType: fromEntityType,
          fromId: fromEntityId,
          toType: newRel.toType,
          toId: newRel.toId,
          relationType: newRel.relationType,
          documentation_5wh: newRel.rationale
            ? { why: { rationale: newRel.rationale } }
            : undefined,
        }),
      })
      const j = await r.json()
      if (!j.success) {
        setError(j.error?.message ?? "Create failed")
        return
      }
      setAdding(false)
      setNewRel({ toType: "idea", toId: "", relationType: "related_to", rationale: "" })
      setSearchQ("")
      setSearchResults([])
      fetchRelations()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed")
    }
  }

  const deleteRelation = async (id: string) => {
    try {
      const r = await fetch(`/api/entity-relations/${id}`, { method: "DELETE" })
      const j = await r.json()
      if (j.success) fetchRelations()
    } catch {
      // ignore
    }
  }

  const outgoing = relations.filter(
    (r) => r.fromType === fromEntityType && r.fromId === fromEntityId
  )
  const incoming = relations.filter(
    (r) => r.toType === fromEntityType && r.toId === fromEntityId
  )

  return (
    <div className={className ?? "j-card"} style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--j-text, #e2e8f0)" }}>
          Cross-links ({relations.length})
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="j-btn-sm"
          style={btnStyle}
        >
          {adding ? <X size={12} /> : <Plus size={12} />} {adding ? "Cancel" : "Link"}
        </button>
      </div>

      {error && (
        <div style={{ ...alertStyle, marginBottom: 12 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {adding && (
        <div style={addCardStyle}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select
              value={newRel.relationType}
              onChange={(e) => setNewRel({ ...newRel, relationType: e.target.value as never })}
              style={selectStyle}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={newRel.toType}
              onChange={(e) => setNewRel({ ...newRel, toType: e.target.value })}
              style={selectStyle}
            >
              {COMMON_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search
              size={12}
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--j-muted, #94a3b8)",
              }}
            />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search to find target (or paste UUID)"
              style={{ ...inputStyle, paddingLeft: 28, width: "100%" }}
            />
          </div>
          <input
            type="text"
            value={newRel.toId}
            onChange={(e) => setNewRel({ ...newRel, toId: e.target.value })}
            placeholder="target UUID"
            style={{ ...inputStyle, width: "100%", marginBottom: 8, fontFamily: "monospace", fontSize: 11 }}
          />
          {searchResults.length > 0 && (
            <div style={{ marginBottom: 8, maxHeight: 200, overflowY: "auto" }}>
              {searchResults.map((r) => (
                <div
                  key={`${r.entity_type}:${r.entity_id}`}
                  onClick={() => {
                    setNewRel({ ...newRel, toType: r.entity_type, toId: r.entity_id })
                    setSearchResults([])
                  }}
                  style={resultRow}
                >
                  <span style={{ color: "var(--j-muted, #94a3b8)", fontSize: 10 }}>{r.entity_type}</span>
                  <span style={{ marginLeft: 8, color: "var(--j-text, #e2e8f0)" }}>{r.title}</span>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={newRel.rationale}
            onChange={(e) => setNewRel({ ...newRel, rationale: e.target.value })}
            placeholder="Why this link? (optional but recommended)"
            rows={2}
            style={{ ...inputStyle, width: "100%", marginBottom: 8, resize: "vertical" }}
          />
          <button onClick={createRelation} style={{ ...btnStyle, width: "100%" }}>
            Create link
          </button>
        </div>
      )}

      {loading ? (
        <div style={emptyStyle}>Loading…</div>
      ) : relations.length === 0 ? (
        <div style={emptyStyle}>
          No cross-links yet. Click <Plus size={10} style={{ display: "inline" }} /> Link to connect this {fromEntityType} to another entity.
        </div>
      ) : (
        <>
          {outgoing.length > 0 && (
            <div>
              <div style={sectionLabel}>Outgoing ({outgoing.length})</div>
              {outgoing.map((r) => (
                <RelationRow key={r.id} rel={r} onDelete={() => deleteRelation(r.id)} direction="out" />
              ))}
            </div>
          )}
          {incoming.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={sectionLabel}>Incoming ({incoming.length})</div>
              {incoming.map((r) => (
                <RelationRow key={r.id} rel={r} onDelete={() => deleteRelation(r.id)} direction="in" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RelationRow({
  rel,
  onDelete,
  direction,
}: {
  rel: Relation
  onDelete: () => void
  direction: "in" | "out"
}) {
  return (
    <div style={rowStyle}>
      <span style={{ color: "var(--j-muted, #94a3b8)", fontSize: 10, fontFamily: "monospace" }}>
        {direction === "out" ? rel.relationType : `← ${rel.relationType}`}
      </span>
      <ArrowRight size={10} style={{ color: "var(--j-muted, #94a3b8)" }} />
      <span style={{ fontSize: 11, color: "var(--j-text, #e2e8f0)" }}>
        {direction === "out" ? rel.toType : rel.fromType}
      </span>
      <code style={{ fontSize: 10, color: "var(--j-muted, #94a3b8)" }}>
        {(direction === "out" ? rel.toId : rel.fromId).slice(0, 8)}
      </code>
      <button
        onClick={onDelete}
        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--j-muted, #94a3b8)", cursor: "pointer", padding: 2 }}
        title="Remove link"
      >
        <X size={12} />
      </button>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  background: "var(--j-surface-elevated, #1f2937)",
  border: "1px solid var(--j-border, #334155)",
  borderRadius: 4,
  color: "var(--j-text, #e2e8f0)",
  fontSize: 11,
  cursor: "pointer",
  justifyContent: "center",
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--j-surface, #0f172a)",
  border: "1px solid var(--j-border, #334155)",
  borderRadius: 4,
  padding: "4px 6px",
  color: "var(--j-text, #e2e8f0)",
  fontSize: 11,
}

const inputStyle: React.CSSProperties = {
  background: "var(--j-surface, #0f172a)",
  border: "1px solid var(--j-border, #334155)",
  borderRadius: 4,
  padding: "6px 8px",
  color: "var(--j-text, #e2e8f0)",
  fontSize: 11,
}

const addCardStyle: React.CSSProperties = {
  background: "var(--j-surface, #0f172a)",
  border: "1px dashed var(--j-border, #334155)",
  borderRadius: 4,
  padding: 12,
  marginBottom: 12,
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 8px",
  background: "var(--j-surface, #0f172a)",
  borderRadius: 4,
  marginBottom: 4,
  border: "1px solid var(--j-border, #1e293b)",
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--j-muted, #94a3b8)",
  marginBottom: 6,
}

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--j-muted, #94a3b8)",
  textAlign: "center",
  padding: 16,
  fontStyle: "italic",
}

const alertStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 8,
  background: "rgba(220, 38, 38, 0.1)",
  border: "1px solid rgba(220, 38, 38, 0.4)",
  borderRadius: 4,
  color: "#fca5a5",
  fontSize: 11,
}

const resultRow: React.CSSProperties = {
  padding: "4px 8px",
  cursor: "pointer",
  borderRadius: 3,
  fontSize: 11,
  marginBottom: 2,
  background: "var(--j-surface, #0f172a)",
  border: "1px solid var(--j-border, #1e293b)",
}
