"use client"

import {
  useState,
  useEffect,
  useCallback,
  use,
  useRef,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useUser } from "@stackframe/stack"
import { formatDistanceToNow } from "date-fns"
import { DashboardLayout } from "@/components/navigation"
import { EnvelopePanel } from "@/components/library/EnvelopePanel"
import { CrossLinkPanel } from "@/components/cross-links/CrossLinkPanel"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────────────

interface IdeaDetail {
  id: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  lifecycle: "seed" | "exploring" | "refined" | "promoted" | "archived"
  createdAt: string
  updatedAt: string
  facetCount: number
  branchCount: number
  validationCount: number
  activeBranch: { id: string; name: string } | null
  facets: IdeaFacet[]
  documentation_5wh?: Record<string, unknown>
}

interface IdeaFacet {
  id: string
  facetType: string
  name: string | null
  data: Record<string, unknown>
  orderIndex: number
  branchName?: string
  branchId?: string | null
}

interface IdeaBranch {
  id: string
  name: string
  isMain: boolean
  isActive: boolean
  createdAt: string
  parentBranchName?: string | null
}

interface IdeaValidation {
  id: string
  agentType: string
  status: string
  validationScore: number | null
  blockers: string[]
  recommendations: string[]
  createdAt: string
  completedAt: string | null
}

interface IdeaRefinement {
  id: string
  refinement_type: string
  title: string
  description: string | null
  status: string
  source_project_id: string | null
  source_project_name: string | null
  created_at: string
}

interface IdeaDocument {
  id: string
  document_type: string
  title: string
  content: string | null
  content_format: string
  version: number
  created_at: string
}

interface IdeaRelationship {
  id: string
  from_idea_id: string
  to_idea_id: string
  relationship_type: string
  metadata?: Record<string, unknown>
}

// ── Constants ──────────────────────────────────────────────────────────────

const LIFECYCLE_OPTIONS = [
  { value: "seed", label: "Seed", pill: "j-idea" },
  { value: "exploring", label: "Exploring", pill: "j-info" },
  { value: "refined", label: "Refined", pill: "j-pos" },
  { value: "promoted", label: "Promoted", pill: "j-biz" },
  { value: "archived", label: "Archived", pill: "j-muted" },
] as const

const FACET_TYPE_PILL: Record<string, string> = {
  pros_cons: "j-pos",
  timeline: "j-info",
  market_research: "j-biz",
  technical_specs: "j-proj",
  financials: "j-warn",
  dependencies: "j-ghost",
  risks: "j-neg",
  alternatives: "j-idea",
  custom: "j-muted",
}

const FACET_TYPE_LABELS: Record<string, string> = {
  pros_cons: "Pros & Cons",
  timeline: "Timeline",
  market_research: "Market Research",
  technical_specs: "Tech Specs",
  financials: "Financials",
  dependencies: "Dependencies",
  risks: "Risks",
  alternatives: "Alternatives",
  custom: "Custom",
}

const REFINEMENT_TYPE_OPTIONS = [
  "feature_request",
  "bug_report",
  "scope_change",
  "technical_debt",
  "learning",
  "pivot",
  "validation_result",
]

const DOCUMENT_TYPE_OPTIONS = [
  "business_plan",
  "prd",
  "pitch_deck",
  "tech_spec",
  "executive_summary",
]

const REFINEMENT_STATUS_PILL: Record<string, string> = {
  pending: "j-warn",
  applied: "j-pos",
  rejected: "j-neg",
  deferred: "j-muted",
}

const TAB_IDS = [
  "overview",
  "facets",
  "branches",
  "validations",
  "refinements",
  "documents",
  "envelope",
  "related",
] as const

type TabId = (typeof TAB_IDS)[number]

// ── Small shared utilities ─────────────────────────────────────────────────

function relTime(ts: string) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
  } catch {
    return ""
  }
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 16px",
        color: "oklch(0.420 0 0)",
        fontSize: 13,
        border: "1px dashed var(--j-hairline)",
        borderRadius: 10,
      }}
    >
      {msg}
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="j-col" style={{ gap: 8 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 56,
            borderRadius: 8,
            background: "oklch(1 0 0 / 0.04)",
            animation: "j-pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  )
}

// ── Inline editable title ──────────────────────────────────────────────────

function InlineTitle({
  value,
  onSave,
}: {
  value: string
  onSave: (v: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
    setTimeout(() => ref.current?.select(), 0)
  }

  const commit = async () => {
    if (!draft.trim() || draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    await onSave(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        disabled={saving}
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          background: "oklch(1 0 0 / 0.04)",
          border: "none",
          boxShadow: "0 0 0 1px var(--j-ring)",
          borderRadius: 8,
          padding: "4px 10px",
          color: "oklch(0.985 0 0)",
          outline: "none",
          fontFamily: "inherit",
          width: "100%",
        }}
      />
    )
  }

  return (
    <h1
      onClick={startEdit}
      title="Click to edit"
      style={{
        fontSize: 22,
        fontWeight: 500,
        margin: 0,
        letterSpacing: "-0.02em",
        cursor: "text",
        padding: "4px 0",
        lineHeight: 1.3,
      }}
    >
      {value}
    </h1>
  )
}

// ── Tab panels ─────────────────────────────────────────────────────────────

// Overview tab
function OverviewTab({
  idea,
  onPatch,
}: {
  idea: IdeaDetail
  onPatch: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc] = useState(idea.description || "")
  const [saving, setSaving] = useState(false)

  const saveDesc = async () => {
    setSaving(true)
    await onPatch({ description: desc })
    setSaving(false)
    setEditDesc(false)
  }

  return (
    <div className="j-col j-gap-4">
      {/* Description */}
      <div className="j-card">
        <div className="j-card-head">
          <p className="j-card-title">Description</p>
          {!editDesc && (
            <button
              className="j-btn j-btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => setEditDesc(true)}
            >
              Edit
            </button>
          )}
        </div>
        {editDesc ? (
          <div className="j-col" style={{ gap: 8 }}>
            <textarea
              value={desc}
              rows={5}
              onChange={(e) => setDesc(e.target.value)}
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
                lineHeight: 1.6,
              }}
            />
            <div className="j-row" style={{ gap: 8 }}>
              <button
                className="j-btn j-btn-primary"
                onClick={saveDesc}
                disabled={saving}
                style={{ fontSize: 12 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="j-btn j-btn-ghost"
                onClick={() => setEditDesc(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            className="j-muted"
            style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}
          >
            {idea.description || (
              <span style={{ fontStyle: "italic" }}>No description yet. Click Edit to add one.</span>
            )}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="j-card">
        <div className="j-card-head">
          <p className="j-card-title">Details</p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "Category", value: idea.category || "—" },
            {
              label: "Active branch",
              value: idea.activeBranch?.name || "main",
            },
            { label: "Facets", value: String(idea.facetCount) },
            { label: "Validations", value: String(idea.validationCount) },
            { label: "Branches", value: String(idea.branchCount) },
          ].map((row) => (
            <div
              key={row.label}
              style={{
                boxShadow: "0 0 0 1px var(--j-ring)",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>
                {row.label}
              </div>
              <span style={{ fontSize: 13, color: "oklch(0.860 0 0)" }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {idea.tags.length > 0 && (
        <div className="j-card">
          <div className="j-card-head">
            <p className="j-card-title">Tags</p>
          </div>
          <div className="j-row j-wrap" style={{ gap: 6 }}>
            {idea.tags.map((t) => (
              <span key={t} className="j-pill j-idea">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Facets tab
function FacetsTab({
  ideaId,
  activeBranchId,
}: {
  ideaId: string
  activeBranchId: string | null
}) {
  const [facets, setFacets] = useState<IdeaFacet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newType, setNewType] = useState("pros_cons")
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const loaded = useRef(false)

  const fetchFacets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const qs = activeBranchId ? `?branchId=${activeBranchId}` : ""
      const res = await fetch(`/api/ideas/${ideaId}/facets${qs}`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to load facets")
      setFacets(json.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load facets")
    } finally {
      setLoading(false)
    }
  }, [ideaId, activeBranchId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchFacets()
    }
  }, [fetchFacets])

  const createFacet = async () => {
    setCreating(true)
    try {
      const res = await fetch(`/api/ideas/${ideaId}/facets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facetType: newType,
          name: newName.trim() || null,
          branchId: activeBranchId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to create facet")
      toast.success("Facet created")
      setShowNew(false)
      setNewName("")
      setNewType("pros_cons")
      fetchFacets()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create facet")
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <LoadingRows />
  if (error)
    return (
      <p className="j-muted" style={{ fontSize: 13 }}>
        Error: {error}
      </p>
    )

  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between">
        <span className="j-muted" style={{ fontSize: 13 }}>
          {facets.length} facet{facets.length !== 1 ? "s" : ""}
        </span>
        <button
          className="j-btn j-btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => setShowNew((v) => !v)}
        >
          + New facet
        </button>
      </div>

      {showNew && (
        <div
          className="j-card"
          style={{ background: "oklch(1 0 0 / 0.03)" }}
        >
          <div className="j-card-head">
            <p className="j-card-title">Add facet</p>
          </div>
          <div className="j-col" style={{ gap: 10 }}>
            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              >
                {Object.entries(FACET_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Name (optional)
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Competitive analysis"
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                  width: "100%",
                }}
              />
            </div>
            <div className="j-row" style={{ gap: 8 }}>
              <button
                className="j-btn j-btn-primary"
                onClick={createFacet}
                disabled={creating}
                style={{ fontSize: 12 }}
              >
                {creating ? "Creating…" : "Create facet"}
              </button>
              <button
                className="j-btn j-btn-ghost"
                onClick={() => setShowNew(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {facets.length === 0 && !showNew ? (
        <EmptyState msg="No facets yet. Add facets to explore different aspects of your idea." />
      ) : (
        <div className="j-col" style={{ gap: 8 }}>
          {facets.map((f) => (
            <div
              key={f.id}
              className="j-card j-tight"
              style={{ cursor: "pointer" }}
              onClick={() =>
                setExpanded((prev) => (prev === f.id ? null : f.id))
              }
            >
              <div className="j-row j-between">
                <div className="j-row" style={{ gap: 8 }}>
                  <span
                    className={`j-pill ${FACET_TYPE_PILL[f.facetType] || "j-muted"}`}
                  >
                    {FACET_TYPE_LABELS[f.facetType] || f.facetType}
                  </span>
                  <span style={{ fontSize: 13, color: "oklch(0.860 0 0)" }}>
                    {f.name || "(unnamed)"}
                  </span>
                </div>
                <span
                  className="j-muted"
                  style={{ fontSize: 11, flexShrink: 0 }}
                >
                  {expanded === f.id ? "▲" : "▼"}
                </span>
              </div>

              {expanded === f.id && (
                <div
                  style={{ marginTop: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <pre
                    style={{
                      fontSize: 11,
                      color: "oklch(0.708 0 0)",
                      background: "oklch(1 0 0 / 0.03)",
                      boxShadow: "0 0 0 1px var(--j-hairline)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      overflow: "auto",
                      maxHeight: 240,
                      margin: 0,
                      fontFamily: "var(--font-geist-mono, monospace)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(f.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Branches tab
function BranchesTab({ ideaId }: { ideaId: string }) {
  const [branches, setBranches] = useState<IdeaBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/ideas/${ideaId}/branches`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to load branches")
      setBranches(json.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load branches")
    } finally {
      setLoading(false)
    }
  }, [ideaId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchBranches()
    }
  }, [fetchBranches])

  const switchActive = async (branchId: string) => {
    setSwitching(branchId)
    try {
      const res = await fetch(
        `/api/ideas/${ideaId}/branches/${branchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        }
      )
      if (!res.ok) throw new Error("Failed to switch branch")
      toast.success("Active branch updated")
      fetchBranches()
    } catch {
      toast.error("Could not switch active branch")
    } finally {
      setSwitching(null)
    }
  }

  if (loading) return <LoadingRows />
  if (error)
    return (
      <p className="j-muted" style={{ fontSize: 13 }}>
        Error: {error}
      </p>
    )
  if (branches.length === 0)
    return <EmptyState msg="No branches found for this idea." />

  return (
    <div className="j-col" style={{ gap: 8 }}>
      {branches.map((b) => (
        <div
          key={b.id}
          className="j-card j-tight"
          style={{
            boxShadow: b.isActive
              ? "0 0 0 1px var(--j-accent)"
              : "0 0 0 1px var(--j-ring)",
          }}
        >
          <div className="j-row j-between">
            <div className="j-row" style={{ gap: 8 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "oklch(0.985 0 0)",
                }}
              >
                {b.name}
              </span>
              {b.isMain && (
                <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
                  main
                </span>
              )}
              {b.isActive && (
                <span className="j-pill j-proj" style={{ fontSize: 10 }}>
                  active
                </span>
              )}
            </div>
            {!b.isActive && (
              <button
                className="j-btn j-btn-ghost"
                style={{ fontSize: 11 }}
                onClick={() => switchActive(b.id)}
                disabled={switching === b.id}
              >
                {switching === b.id ? "Switching…" : "Set active"}
              </button>
            )}
          </div>
          {b.parentBranchName && (
            <p
              className="j-muted"
              style={{ fontSize: 12, margin: "6px 0 0" }}
            >
              Branched from: {b.parentBranchName}
            </p>
          )}
          <p className="j-muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
            Created {relTime(b.createdAt)}
          </p>
        </div>
      ))}
    </div>
  )
}

// Validations tab
function ValidationsTab({ ideaId }: { ideaId: string }) {
  const [validations, setValidations] = useState<IdeaValidation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetchValidations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/ideas/${ideaId}/validations`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to load validations")
      setValidations(json.data || [])
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to load validations"
      )
    } finally {
      setLoading(false)
    }
  }, [ideaId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchValidations()
    }
  }, [fetchValidations])

  if (loading) return <LoadingRows />
  if (error)
    return (
      <p className="j-muted" style={{ fontSize: 13 }}>
        Error: {error}
      </p>
    )
  if (validations.length === 0)
    return (
      <EmptyState msg="No validation sessions yet. Validations are created from the canvas view." />
    )

  return (
    <div className="j-col" style={{ gap: 8 }}>
      {validations.map((v) => (
        <div key={v.id} className="j-card j-tight">
          <div className="j-row j-between" style={{ marginBottom: 8 }}>
            <div className="j-row" style={{ gap: 8 }}>
              <span
                className={`j-pill ${v.status === "completed" ? "j-pos" : v.status === "active" ? "j-info" : "j-muted"}`}
              >
                {v.status}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "oklch(0.860 0 0)",
                  textTransform: "capitalize",
                }}
              >
                {v.agentType} validation
              </span>
            </div>
            {v.validationScore !== null && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    v.validationScore >= 70
                      ? "var(--j-pos)"
                      : v.validationScore >= 40
                        ? "var(--j-warn)"
                        : "var(--j-neg)",
                }}
              >
                {v.validationScore}/100
              </span>
            )}
          </div>

          {v.blockers.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>
                Blockers
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12,
                  color: "var(--j-neg)",
                  lineHeight: 1.5,
                }}
              >
                {v.blockers.slice(0, 3).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {v.recommendations.length > 0 && (
            <div>
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>
                Recommendations
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12,
                  color: "var(--j-pos)",
                  lineHeight: 1.5,
                }}
              >
                {v.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="j-muted" style={{ fontSize: 11, marginTop: 8 }}>
            {relTime(v.createdAt)}
            {v.completedAt && ` · completed ${relTime(v.completedAt)}`}
          </p>
        </div>
      ))}
    </div>
  )
}

// Refinements tab
function RefinementsTab({ ideaId }: { ideaId: string }) {
  const [refinements, setRefinements] = useState<IdeaRefinement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    sourceProjectId: "",
    refinementType: "feature_request",
    title: "",
    description: "",
    rationale: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const loaded = useRef(false)

  const fetchRefinements = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/ideas/${ideaId}/refinements`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to load refinements")
      setRefinements(json.data || [])
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to load refinements"
      )
    } finally {
      setLoading(false)
    }
  }, [ideaId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchRefinements()
    }
  }, [fetchRefinements])

  const createRefinement = async () => {
    if (!form.sourceProjectId.trim() || !form.title.trim()) {
      toast.error("Source project ID and title are required")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/ideas/${ideaId}/refinements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProjectId: form.sourceProjectId.trim(),
          refinementType: form.refinementType,
          title: form.title.trim(),
          description: form.description.trim() || null,
          documentation_5wh: form.rationale
            ? { why: { rationale: form.rationale } }
            : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to create refinement")
      toast.success("Refinement created")
      setShowNew(false)
      setForm({
        sourceProjectId: "",
        refinementType: "feature_request",
        title: "",
        description: "",
        rationale: "",
      })
      fetchRefinements()
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create refinement"
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingRows />
  if (error)
    return (
      <p className="j-muted" style={{ fontSize: 13 }}>
        Error: {error}
      </p>
    )

  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between">
        <span className="j-muted" style={{ fontSize: 13 }}>
          {refinements.length} refinement{refinements.length !== 1 ? "s" : ""}
        </span>
        <button
          className="j-btn j-btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => setShowNew((v) => !v)}
        >
          + New refinement
        </button>
      </div>

      {showNew && (
        <div className="j-card" style={{ background: "oklch(1 0 0 / 0.03)" }}>
          <div className="j-card-head">
            <p className="j-card-title">New refinement</p>
          </div>
          <div className="j-col" style={{ gap: 10 }}>
            {[
              {
                key: "title",
                label: "Title *",
                placeholder: "Short summary of the refinement",
                type: "input",
              },
              {
                key: "sourceProjectId",
                label: "Source project ID *",
                placeholder: "UUID of the project this feedback came from",
                type: "input",
              },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="j-col" style={{ gap: 4 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "oklch(0.556 0 0)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {label}
                </label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  style={{
                    background: "oklch(1 0 0 / 0.04)",
                    border: "none",
                    boxShadow: "0 0 0 1px var(--j-ring)",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 13,
                    color: "oklch(0.860 0 0)",
                    fontFamily: "inherit",
                    outline: "none",
                    width: "100%",
                  }}
                />
              </div>
            ))}

            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Type
              </label>
              <select
                value={form.refinementType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, refinementType: e.target.value }))
                }
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              >
                {REFINEMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Description
              </label>
              <textarea
                value={form.description}
                rows={3}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Describe the refinement in detail…"
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

            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Rationale (why)
              </label>
              <input
                value={form.rationale}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rationale: e.target.value }))
                }
                placeholder="Why does this refinement matter?"
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                  width: "100%",
                }}
              />
            </div>

            <div className="j-row" style={{ gap: 8 }}>
              <button
                className="j-btn j-btn-primary"
                onClick={createRefinement}
                disabled={submitting}
                style={{ fontSize: 12 }}
              >
                {submitting ? "Creating…" : "Create refinement"}
              </button>
              <button
                className="j-btn j-btn-ghost"
                onClick={() => setShowNew(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {refinements.length === 0 && !showNew ? (
        <EmptyState msg="No refinements yet. Refinements capture feedback from project execution." />
      ) : (
        <div className="j-col" style={{ gap: 8 }}>
          {refinements.map((r) => (
            <div key={r.id} className="j-card j-tight">
              <div className="j-row j-between" style={{ marginBottom: 6 }}>
                <div className="j-row" style={{ gap: 8 }}>
                  <span
                    className={`j-pill ${REFINEMENT_STATUS_PILL[r.status] || "j-muted"}`}
                  >
                    {r.status}
                  </span>
                  <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
                    {r.refinement_type?.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="j-muted" style={{ fontSize: 11 }}>
                  {relTime(r.created_at)}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "oklch(0.985 0 0)",
                  margin: 0,
                }}
              >
                {r.title}
              </p>
              {r.description && (
                <p
                  className="j-muted"
                  style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}
                >
                  {r.description}
                </p>
              )}
              {r.source_project_name && (
                <p
                  className="j-muted"
                  style={{ fontSize: 11, margin: "6px 0 0" }}
                >
                  Source: {r.source_project_name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Documents tab
function DocumentsTab({ ideaId }: { ideaId: string }) {
  const [docs, setDocs] = useState<IdeaDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    documentType: "prd",
    title: "",
    content: "",
    contentFormat: "markdown",
  })
  const [submitting, setSubmitting] = useState(false)
  const loaded = useRef(false)

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/ideas/${ideaId}/documents`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to load documents")
      setDocs(json.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load documents")
    } finally {
      setLoading(false)
    }
  }, [ideaId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchDocs()
    }
  }, [fetchDocs])

  const createDoc = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/ideas/${ideaId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: form.documentType,
          title: form.title.trim(),
          content: form.content.trim() || null,
          contentFormat: form.contentFormat,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to create document")
      toast.success("Document created")
      setShowNew(false)
      setForm({ documentType: "prd", title: "", content: "", contentFormat: "markdown" })
      fetchDocs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create document")
    } finally {
      setSubmitting(false)
    }
  }

  const DOCTYPE_PILL: Record<string, string> = {
    business_plan: "j-biz",
    prd: "j-proj",
    pitch_deck: "j-idea",
    tech_spec: "j-info",
    executive_summary: "j-pos",
  }

  if (loading) return <LoadingRows />
  if (error)
    return (
      <p className="j-muted" style={{ fontSize: 13 }}>
        Error: {error}
      </p>
    )

  return (
    <div className="j-col j-gap-4">
      <div className="j-row j-between">
        <span className="j-muted" style={{ fontSize: 13 }}>
          {docs.length} document{docs.length !== 1 ? "s" : ""}
        </span>
        <button
          className="j-btn j-btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => setShowNew((v) => !v)}
        >
          + New document
        </button>
      </div>

      {showNew && (
        <div className="j-card" style={{ background: "oklch(1 0 0 / 0.03)" }}>
          <div className="j-card-head">
            <p className="j-card-title">New document</p>
          </div>
          <div className="j-col" style={{ gap: 10 }}>
            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Type
              </label>
              <select
                value={form.documentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, documentType: e.target.value }))
                }
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              >
                {DOCUMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Title *
              </label>
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Document title"
                style={{
                  background: "oklch(1 0 0 / 0.04)",
                  border: "none",
                  boxShadow: "0 0 0 1px var(--j-ring)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "oklch(0.860 0 0)",
                  fontFamily: "inherit",
                  outline: "none",
                  width: "100%",
                }}
              />
            </div>
            <div className="j-col" style={{ gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.556 0 0)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Content
              </label>
              <textarea
                value={form.content}
                rows={6}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                placeholder="Document body (markdown supported)…"
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
            <div className="j-row" style={{ gap: 8 }}>
              <button
                className="j-btn j-btn-primary"
                onClick={createDoc}
                disabled={submitting}
                style={{ fontSize: 12 }}
              >
                {submitting ? "Creating…" : "Create document"}
              </button>
              <button
                className="j-btn j-btn-ghost"
                onClick={() => setShowNew(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {docs.length === 0 && !showNew ? (
        <EmptyState msg="No documents yet. Generate a PRD, business plan, or other document." />
      ) : (
        <div className="j-col" style={{ gap: 8 }}>
          {docs.map((d) => (
            <div
              key={d.id}
              className="j-card j-tight"
              style={{ cursor: "pointer" }}
              onClick={() =>
                setExpanded((prev) => (prev === d.id ? null : d.id))
              }
            >
              <div className="j-row j-between">
                <div className="j-row" style={{ gap: 8 }}>
                  <span
                    className={`j-pill ${DOCTYPE_PILL[d.document_type] || "j-muted"}`}
                  >
                    {d.document_type.replace(/_/g, " ")}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "oklch(0.860 0 0)",
                    }}
                  >
                    {d.title}
                  </span>
                  <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
                    v{d.version}
                  </span>
                </div>
                <div className="j-row" style={{ gap: 8 }}>
                  <span className="j-muted" style={{ fontSize: 11 }}>
                    {relTime(d.created_at)}
                  </span>
                  <span
                    className="j-muted"
                    style={{ fontSize: 11, flexShrink: 0 }}
                  >
                    {expanded === d.id ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {expanded === d.id && d.content && (
                <div
                  style={{ marginTop: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <pre
                    style={{
                      fontSize: 12,
                      color: "oklch(0.708 0 0)",
                      background: "oklch(1 0 0 / 0.03)",
                      boxShadow: "0 0 0 1px var(--j-hairline)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      overflow: "auto",
                      maxHeight: 320,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "var(--font-geist-mono, monospace)",
                    }}
                  >
                    {d.content}
                  </pre>
                </div>
              )}
              {expanded === d.id && !d.content && (
                <p
                  className="j-muted"
                  style={{ fontSize: 12, marginTop: 10 }}
                >
                  No content stored for this document.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Related tab
function RelatedTab({ ideaId }: { ideaId: string }) {
  const [relationships, setRelationships] = useState<IdeaRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  const fetchRelationships = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/ideas/${ideaId}/relationships`)
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(
          json?.error?.message || "Failed to load relationships"
        )
      setRelationships(json.data || [])
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to load relationships"
      )
    } finally {
      setLoading(false)
    }
  }, [ideaId])

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      fetchRelationships()
    }
  }, [fetchRelationships])

  const REL_PILL: Record<string, string> = {
    parent_child: "j-proj",
    evolved_into: "j-pos",
    merged_from: "j-biz",
    merged_into: "j-biz",
    related: "j-ghost",
    blocks: "j-neg",
    blocked_by: "j-neg",
  }

  return (
    <div className="j-col" style={{ gap: 16 }}>
      {/* Idea-to-idea relationships (legacy idea_relationships table) */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--j-muted, #94a3b8)", marginBottom: 8 }}>
          Idea relationships
        </div>
        {loading ? (
          <LoadingRows />
        ) : error ? (
          <p className="j-muted" style={{ fontSize: 13 }}>Error: {error}</p>
        ) : relationships.length === 0 ? (
          <EmptyState msg="No idea-to-idea relationships yet. Use Merge, Branch, or Evolve actions to link ideas." />
        ) : (
          <div className="j-col" style={{ gap: 8 }}>
            {relationships.map((r) => {
              const isFrom = r.from_idea_id === ideaId
              const otherId = isFrom ? r.to_idea_id : r.from_idea_id
              const direction = isFrom ? "→" : "←"
              return (
                <div key={r.id} className="j-card j-tight">
                  <div className="j-row" style={{ gap: 10 }}>
                    <span className={`j-pill ${REL_PILL[r.relationship_type] || "j-ghost"}`}>
                      {r.relationship_type.replace(/_/g, " ")}
                    </span>
                    <span className="j-muted" style={{ fontSize: 13, fontFamily: "monospace" }}>{direction}</span>
                    <Link href={`/ideas/${otherId}`} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: 12, color: "var(--j-accent)", fontFamily: "monospace", textDecoration: "underline", cursor: "pointer" }}>
                        {otherId.slice(0, 12)}…
                      </span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Polymorphic cross-links to any entity (F2) */}
      <CrossLinkPanel fromEntityType="idea" fromEntityId={ideaId} />
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function IdeaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: ideaId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useUser()

  const [idea, setIdea] = useState<IdeaDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tab from URL ?tab=...
  const rawTab = searchParams.get("tab") as TabId | null
  const activeTab: TabId =
    rawTab && (TAB_IDS as readonly string[]).includes(rawTab)
      ? rawTab
      : "overview"

  const setTab = (t: TabId) => {
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    window.history.replaceState(null, "", url.toString())
    // Force re-render via a local state tick
    setTabTick((n) => n + 1)
  }
  const [tabTick, setTabTick] = useState(0)
  void tabTick // suppress lint; used to force re-render when URL changes

  // Re-compute active tab after replaceState
  const displayTab: TabId = (() => {
    if (typeof window === "undefined") return "overview"
    const t = new URLSearchParams(window.location.search).get("tab") as TabId | null
    return t && (TAB_IDS as readonly string[]).includes(t) ? t : "overview"
  })()

  useEffect(() => {
    const fetchIdea = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch(`/api/ideas/${ideaId}`)
        if (!response.ok)
          throw new Error(`Failed to fetch idea: ${response.statusText}`)
        const result = await response.json()
        if (!result.success)
          throw new Error(result.error || "Failed to fetch idea")
        setIdea(result.data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        setError(msg)
        toast.error("Failed to load idea", { description: msg })
      } finally {
        setIsLoading(false)
      }
    }
    if (user && ideaId) fetchIdea()
  }, [user, ideaId])

  const patchIdea = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Update failed")
      setIdea((prev) => (prev ? { ...prev, ...json.data } : prev))
      toast.success("Saved")
    },
    [ideaId]
  )

  const handleEnvelopeSave = useCallback(
    async (patch: { documentation_5wh: Record<string, unknown> }) => {
      const res = await fetch(`/api/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success)
        throw new Error(json?.error?.message || "Failed to save envelope")
      toast.success("Envelope saved")
    },
    [ideaId]
  )

  const deleteIdea = async () => {
    if (!confirm("Delete this idea? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/ideas/${ideaId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete idea")
      toast.success("Idea deleted")
      router.push("/ideas")
    } catch {
      toast.error("Failed to delete idea")
    }
  }

  const archiveIdea = async () => {
    await patchIdea({ lifecycle: "archived" })
  }

  if (!user || isLoading) {
    return (
      <DashboardLayout>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 300,
          }}
        >
          <div className="j-dot-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !idea) {
    return (
      <DashboardLayout>
        <div
          className="j-content"
          style={{ textAlign: "center", padding: 48 }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "oklch(0.545 0.199 27 / 0.15)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 16px",
              fontSize: 28,
            }}
          >
            ⚠
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>
            Failed to load idea
          </h3>
          <p className="j-muted" style={{ marginBottom: 20 }}>
            {error || "Idea not found"}
          </p>
          <div
            className="j-row"
            style={{ justifyContent: "center", gap: 10 }}
          >
            <Link href="/ideas">
              <button className="j-btn j-btn-ghost">← Back to Ideas</button>
            </Link>
            <button
              className="j-btn j-btn-primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const lifecycleDef =
    LIFECYCLE_OPTIONS.find((o) => o.value === idea.lifecycle) ||
    LIFECYCLE_OPTIONS[0]

  const TAB_LABELS: Record<TabId, string> = {
    overview: "Overview",
    facets: `Facets (${idea.facetCount})`,
    branches: `Branches (${idea.branchCount})`,
    validations: `Validations (${idea.validationCount})`,
    refinements: "Refinements",
    documents: "Documents",
    envelope: "5W+H",
    related: "Related",
  }

  return (
    <DashboardLayout>
      <div className="j-content j-col j-gap-4">
        {/* ── Back + Header ──────────────────────────────────────── */}
        <div>
          <Link href="/ideas">
            <button
              className="j-btn j-btn-ghost"
              style={{ marginBottom: 14, fontSize: 12 }}
            >
              ← Ideas
            </button>
          </Link>

          <div
            className="j-row j-between"
            style={{ alignItems: "flex-start", gap: 16 }}
          >
            {/* Left: title + meta */}
            <div
              className="j-col"
              style={{ gap: 8, flex: 1, minWidth: 0 }}
            >
              {/* Lifecycle pill + category + tags row */}
              <div className="j-row j-wrap" style={{ gap: 6 }}>
                <select
                  value={idea.lifecycle}
                  onChange={(e) =>
                    patchIdea({ lifecycle: e.target.value })
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  {LIFECYCLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className={`j-pill ${lifecycleDef.pill}`}>
                  {lifecycleDef.label}
                </span>
                {idea.category && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "oklch(0.556 0 0)",
                      background: "oklch(1 0 0 / 0.04)",
                      padding: "2px 6px",
                      borderRadius: 5,
                      boxShadow: "inset 0 0 0 1px var(--j-hairline)",
                    }}
                  >
                    {idea.category}
                  </span>
                )}
                {idea.tags.slice(0, 4).map((t) => (
                  <span key={t} className="j-pill j-ghost" style={{ fontSize: 10 }}>
                    {t}
                  </span>
                ))}
              </div>

              <InlineTitle
                value={idea.title}
                onSave={(v) => patchIdea({ title: v })}
              />

              <div className="j-row j-wrap" style={{ gap: 12 }}>
                <span className="j-muted" style={{ fontSize: 11 }}>
                  Created {relTime(idea.createdAt)}
                </span>
                <span className="j-muted" style={{ fontSize: 11 }}>
                  Updated {relTime(idea.updatedAt)}
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div
              className="j-col"
              style={{ gap: 8, alignItems: "flex-end", flexShrink: 0 }}
            >
              <div className="j-row" style={{ gap: 8 }}>
                <button
                  className="j-btn j-btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={archiveIdea}
                >
                  Archive
                </button>
                <button
                  className="j-btn j-btn-ghost"
                  style={{
                    fontSize: 12,
                    color: "var(--j-neg)",
                    boxShadow: "0 0 0 1px oklch(0.577 0.245 27 / 0.35)",
                  }}
                  onClick={deleteIdea}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div
          className="j-tabs"
          style={{
            overflowX: "auto",
            width: "100%",
            scrollbarWidth: "none",
          }}
        >
          {TAB_IDS.map((t) => (
            <button
              key={t}
              className={`j-tab${displayTab === t ? " j-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* ── Tab content ────────────────────────────────────────── */}
        <div>
          {displayTab === "overview" && (
            <OverviewTab idea={idea} onPatch={patchIdea} />
          )}

          {displayTab === "facets" && (
            <FacetsTab
              ideaId={ideaId}
              activeBranchId={idea.activeBranch?.id || null}
            />
          )}

          {displayTab === "branches" && <BranchesTab ideaId={ideaId} />}

          {displayTab === "validations" && (
            <ValidationsTab ideaId={ideaId} />
          )}

          {displayTab === "refinements" && (
            <RefinementsTab ideaId={ideaId} />
          )}

          {displayTab === "documents" && <DocumentsTab ideaId={ideaId} />}

          {displayTab === "envelope" && (
            <EnvelopePanel
              envelope={
                (idea.documentation_5wh as Record<string, unknown>) || null
              }
              onSave={handleEnvelopeSave}
            />
          )}

          {displayTab === "related" && <RelatedTab ideaId={ideaId} />}
        </div>
      </div>
    </DashboardLayout>
  )
}
