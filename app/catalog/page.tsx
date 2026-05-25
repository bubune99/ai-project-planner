"use client"

/**
 * /catalog — Catalog explorer (Idea H Wave 5)
 *
 * Master/detail explorer for the surfaces catalog. Shows all registered
 * surfaces with filter/search, and a detail pane with deps + scan events.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/navigation"
import { Icon } from "@/components/jarvis/icons"
import { EnvelopePanel } from "@/components/library/EnvelopePanel"
import { formatDistanceToNow } from "date-fns"
import type { Surface, SurfaceDependency, CatalogScanEvent, SurfaceKind, SurfaceStatus } from "@/lib/catalog/types"
import { SURFACE_KINDS, DEPENDENCY_KINDS } from "@/lib/catalog/types"

// ── Colour palette per surface kind ─────────────────────────────────────────

const KIND_PILL: Record<string, string> = {
  db_table: "j-proj",
  db_column: "j-ghost",
  db_enum: "j-ghost",
  db_matview: "j-proj",
  db_function: "j-proj",
  api_route: "j-pos",
  mcp_tool: "j-info",
  middleware: "j-warn",
  ui_page: "j-info",
  ui_component: "j-info",
  nav_link: "j-ghost",
  env_var: "j-warn",
  feature_flag: "j-warn",
  config_file: "j-ghost",
  integration: "j-neg",
  webhook_endpoint: "j-neg",
  helper: "j-ghost",
  type_export: "j-ghost",
  zod_schema: "j-warn",
  react_hook: "j-info",
}

const STATUS_PILL: Record<SurfaceStatus, string> = {
  fresh: "j-pos",
  needs_revalidation: "j-warn",
  stale: "j-neg",
  deprecated: "j-muted",
}

// ── Util helpers ─────────────────────────────────────────────────────────────

function shortSha(sha: string | null): string {
  if (!sha) return "—"
  return sha.slice(0, 7)
}

function githubCommitUrl(sha: string): string {
  return `https://github.com/bubune99/ai-project-planner/commit/${sha}`
}

function githubFileUrl(path: string, lineStart?: number): string {
  const base = `https://github.com/bubune99/ai-project-planner/blob/main/${path}`
  return lineStart ? `${base}#L${lineStart}` : base
}

function relTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return "—"
  }
}

// ── Section header atom ──────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      color: "oklch(0.556 0 0)",
      marginBottom: 6,
      marginTop: 14,
      borderTop: "1px solid var(--j-hairline)",
      paddingTop: 12,
    }}>
      {label}
    </div>
  )
}

// ── Deps pane ────────────────────────────────────────────────────────────────

interface DepRowProps {
  dep: SurfaceDependency
  direction: "outgoing" | "incoming"
  onNavigate: (canonicalId: string) => void
}

function DepRow({ dep, direction, onNavigate }: DepRowProps) {
  const targetId = direction === "outgoing" ? dep.to_surface_id : dep.from_surface_id
  return (
    <div className="j-row j-between" style={{ gap: 8, padding: "5px 0", borderBottom: "1px solid var(--j-hairline)" }}>
      <div className="j-row" style={{ gap: 6, minWidth: 0 }}>
        <span className="j-pill j-ghost" style={{ fontSize: 10, flexShrink: 0 }}>{dep.kind}</span>
        <button
          className="j-btn j-btn-ghost"
          style={{ padding: "1px 6px", fontSize: 11, fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onClick={() => onNavigate(targetId)}
          title={targetId}
        >
          {targetId.slice(0, 24)}…
        </button>
      </div>
      {dep.confidence != null && (
        <span className="j-pill j-ghost" style={{ fontSize: 10, flexShrink: 0 }}>
          {Math.round(dep.confidence * 100)}%
        </span>
      )}
    </div>
  )
}

// ── Scan event mini-timeline ─────────────────────────────────────────────────

function ScanEventRow({ ev }: { ev: CatalogScanEvent }) {
  return (
    <div className="j-row" style={{ gap: 8, padding: "5px 0", borderBottom: "1px solid var(--j-hairline)", alignItems: "flex-start" }}>
      <span className="j-pill j-ghost" style={{ fontSize: 10, flexShrink: 0, marginTop: 1 }}>{ev.scan_type}</span>
      <div className="j-col" style={{ gap: 2, minWidth: 0 }}>
        <div className="j-row j-wrap" style={{ gap: 6 }}>
          {ev.commit_sha && (
            <a
              href={githubCommitUrl(ev.commit_sha)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: "monospace", fontSize: 11, color: "var(--j-accent, #3b82f6)" }}
            >
              {shortSha(ev.commit_sha)}
            </a>
          )}
          {ev.triggered_by && (
            <span className="j-pill j-ghost" style={{ fontSize: 10 }}>{ev.triggered_by}</span>
          )}
        </div>
        <span className="j-muted" style={{ fontSize: 11 }}>{relTime(ev.scanned_at)}</span>
      </div>
    </div>
  )
}

// ── Mark-stale modal ─────────────────────────────────────────────────────────

function MarkStaleDialog({
  surface,
  onDone,
  onCancel,
}: {
  surface: Surface
  onDone: () => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/catalog/surfaces/${surface.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "stale", metadata: { stale_reason: reason || undefined } }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed to mark stale")
      onDone()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div className="j-card" style={{ width: 400, maxWidth: "90vw" }}>
        <div className="j-card-head">
          <p className="j-card-title">Mark as stale</p>
          <button className="j-btn j-btn-icon j-btn-ghost" onClick={onCancel}><Icon name="x" size={14} /></button>
        </div>
        <div className="j-col" style={{ gap: 10 }}>
          <p className="j-muted" style={{ fontSize: 12 }}>
            Surface: <code style={{ fontFamily: "monospace" }}>{surface.canonical_id}</code>
          </p>
          <textarea
            placeholder="Reason (optional)"
            value={reason}
            rows={3}
            onChange={e => setReason(e.target.value)}
            style={{
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
            }}
          />
          {err && <span className="j-pill j-neg" style={{ fontSize: 11, alignSelf: "flex-start" }}>{err}</span>}
          <div className="j-row" style={{ gap: 8 }}>
            <button className="j-btn j-btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Mark stale"}
            </button>
            <button className="j-btn j-btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail pane ──────────────────────────────────────────────────────────────

interface DetailPaneProps {
  surface: Surface
  onClose: () => void
  onNavigate: (canonicalId: string) => void
  onRefresh: () => void
}

function DetailPane({ surface, onClose, onNavigate, onRefresh }: DetailPaneProps) {
  const [outDeps, setOutDeps] = useState<SurfaceDependency[]>([])
  const [inDeps, setInDeps] = useState<SurfaceDependency[]>([])
  const [scanEvents, setScanEvents] = useState<CatalogScanEvent[]>([])
  const [depsLoading, setDepsLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [sigExpanded, setSigExpanded] = useState(false)
  const [markStaleOpen, setMarkStaleOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDepsLoading(true)
    Promise.all([
      fetch(`/api/catalog/dependencies?fromSurfaceId=${surface.id}`).then(r => r.json()),
      fetch(`/api/catalog/dependencies?toSurfaceId=${surface.id}`).then(r => r.json()),
    ]).then(([out, into]) => {
      if (cancelled) return
      setOutDeps(Array.isArray(out?.data) ? out.data : [])
      setInDeps(Array.isArray(into?.data) ? into.data : [])
      setDepsLoading(false)
    }).catch(() => { if (!cancelled) setDepsLoading(false) })

    return () => { cancelled = true }
  }, [surface.id])

  useEffect(() => {
    let cancelled = false
    setEventsLoading(true)
    fetch(`/api/catalog/scan-events?since=${encodeURIComponent(surface.created_at)}&limit=40`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        const all: CatalogScanEvent[] = Array.isArray(json?.data) ? json.data : []
        // Client-side filter: only events that reference this surface
        const filtered = all.filter(ev => {
          const added = ev.surfaces_added ?? []
          const modified = ev.surfaces_modified ?? []
          const removed = ev.surfaces_removed ?? []
          return added.includes(surface.id) || modified.includes(surface.id) || removed.includes(surface.id)
        })
        setScanEvents(filtered)
        setEventsLoading(false)
      })
      .catch(() => { if (!cancelled) setEventsLoading(false) })

    return () => { cancelled = true }
  }, [surface.id, surface.created_at])

  const loc = surface.location ?? {}
  const filePath = loc.file_path as string | undefined
  const lineStart = loc.line_start as number | undefined
  const lineEnd = loc.line_end as number | undefined

  return (
    <>
      {markStaleOpen && (
        <MarkStaleDialog
          surface={surface}
          onCancel={() => setMarkStaleOpen(false)}
          onDone={() => { setMarkStaleOpen(false); onRefresh() }}
        />
      )}
      <div className="j-col" style={{ flex: 1, gap: 10, minWidth: 0 }}>
        <div className="j-card">
          {/* Header */}
          <div className="j-card-head">
            <div className="j-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
              <code style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 600, wordBreak: "break-all" }}>
                {surface.canonical_id}
              </code>
              <div className="j-row j-wrap" style={{ gap: 6 }}>
                <span className={`j-pill ${KIND_PILL[surface.kind] ?? "j-ghost"}`} style={{ fontSize: 10 }}>
                  {surface.kind}
                </span>
                <span className={`j-pill ${STATUS_PILL[surface.status]}`} style={{ fontSize: 10 }}>
                  {surface.status}
                </span>
                {surface.deleted_at && (
                  <span className="j-pill j-neg" style={{ fontSize: 10 }}>
                    deprecated {relTime(surface.deleted_at)}
                  </span>
                )}
              </div>
            </div>
            <button className="j-btn j-btn-icon j-btn-ghost" onClick={onClose} title="Close">
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Actions */}
          <div className="j-row j-wrap" style={{ gap: 8, marginTop: 10 }}>
            {surface.status !== "deprecated" && (
              <button
                className="j-btn j-btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setMarkStaleOpen(true)}
              >
                <Icon name="bolt" size={12} /> Mark stale
              </button>
            )}
            <a
              href={`/impact?focus=${encodeURIComponent(surface.canonical_id)}`}
              className="j-btn j-btn-ghost"
              style={{ fontSize: 12, textDecoration: "none" }}
            >
              <Icon name="map" size={12} /> View in graph
            </a>
          </div>

          {/* Location */}
          <SectionLabel label="Location" />
          {filePath ? (
            <div className="j-row j-wrap" style={{ gap: 6 }}>
              <a
                href={githubFileUrl(filePath, lineStart)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "monospace", fontSize: 12, color: "var(--j-accent, #3b82f6)", wordBreak: "break-all" }}
              >
                {filePath}
                {lineStart != null && <span style={{ color: "oklch(0.556 0 0)" }}>#{lineStart}{lineEnd && lineEnd !== lineStart ? `–${lineEnd}` : ""}</span>}
              </a>
            </div>
          ) : (
            <span className="j-muted" style={{ fontSize: 12 }}>No file path recorded</span>
          )}
          {loc.url_pattern && (
            <code style={{ fontSize: 12, fontFamily: "monospace", color: "oklch(0.860 0 0)", marginTop: 4, display: "block" }}>
              {loc.url_pattern as string}
            </code>
          )}

          {/* Signature */}
          <SectionLabel label="Signature" />
          <div style={{ fontSize: 11 }}>
            <button
              className="j-btn j-btn-ghost"
              style={{ padding: "2px 8px", fontSize: 11, marginBottom: 6 }}
              onClick={() => setSigExpanded(v => !v)}
            >
              {sigExpanded ? "Collapse" : "Expand"} signature
            </button>
            {sigExpanded && (
              <pre style={{
                background: "oklch(1 0 0 / 0.03)",
                borderRadius: 6,
                padding: 10,
                overflow: "auto",
                maxHeight: 240,
                fontSize: 11,
                fontFamily: "monospace",
                color: "oklch(0.760 0 0)",
                margin: 0,
              }}>
                {JSON.stringify(surface.signature, null, 2)}
              </pre>
            )}
            {surface.content_hash && (
              <span className="j-muted" style={{ fontSize: 10, display: "block", marginTop: 4 }}>
                sha256: <code>{surface.content_hash.slice(0, 16)}…</code>
              </span>
            )}
          </div>

          {/* Git history */}
          <SectionLabel label="Git History" />
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12 }}>
            <span className="j-muted">First seen</span>
            {surface.first_seen_commit_sha ? (
              <a href={githubCommitUrl(surface.first_seen_commit_sha)} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "monospace", color: "var(--j-accent, #3b82f6)" }}>
                {shortSha(surface.first_seen_commit_sha)}
              </a>
            ) : <span className="j-muted">—</span>}

            <span className="j-muted">Last seen</span>
            {surface.last_seen_commit_sha ? (
              <a href={githubCommitUrl(surface.last_seen_commit_sha)} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "monospace", color: "var(--j-accent, #3b82f6)" }}>
                {shortSha(surface.last_seen_commit_sha)}
              </a>
            ) : <span className="j-muted">—</span>}

            {surface.deprecated_in_commit_sha && (
              <>
                <span className="j-muted">Deprecated in</span>
                <a href={githubCommitUrl(surface.deprecated_in_commit_sha)} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "monospace", color: "var(--j-neg, #f87171)" }}>
                  {shortSha(surface.deprecated_in_commit_sha)}
                </a>
              </>
            )}

            <span className="j-muted">Last verified</span>
            <span style={{ color: "oklch(0.860 0 0)" }}>
              {relTime(surface.last_verified_at)}
              {surface.last_verified_method && (
                <span className="j-muted" style={{ marginLeft: 6 }}>via {surface.last_verified_method}</span>
              )}
            </span>
          </div>
        </div>

        {/* Dependencies */}
        <div className="j-card j-tight">
          <div className="j-card-head">
            <p className="j-card-title">Dependencies</p>
          </div>
          {depsLoading ? (
            <span className="j-muted" style={{ fontSize: 12 }}>Loading…</span>
          ) : (
            <div className="j-col" style={{ gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", marginBottom: 4 }}>
                  Outgoing ({outDeps.length})
                </div>
                {outDeps.length === 0 ? (
                  <span className="j-muted" style={{ fontSize: 12 }}>None</span>
                ) : (
                  outDeps.map(d => <DepRow key={d.id} dep={d} direction="outgoing" onNavigate={onNavigate} />)
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "oklch(0.556 0 0)", marginBottom: 4 }}>
                  Incoming ({inDeps.length})
                </div>
                {inDeps.length === 0 ? (
                  <span className="j-muted" style={{ fontSize: 12 }}>None</span>
                ) : (
                  inDeps.map(d => <DepRow key={d.id} dep={d} direction="incoming" onNavigate={onNavigate} />)
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5W+H Envelope */}
        <EnvelopePanel
          envelope={surface.documentation_5wh}
          onSave={async (patch) => {
            const res = await fetch(`/api/catalog/surfaces/${surface.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            })
            const json = await res.json()
            if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Save failed")
          }}
        />

        {/* Scan events */}
        <div className="j-card j-tight">
          <div className="j-card-head">
            <p className="j-card-title">Scan Events</p>
          </div>
          {eventsLoading ? (
            <span className="j-muted" style={{ fontSize: 12 }}>Loading…</span>
          ) : scanEvents.length === 0 ? (
            <span className="j-muted" style={{ fontSize: 12 }}>No scan events found for this surface</span>
          ) : (
            <div className="j-col" style={{ gap: 0 }}>
              {scanEvents.map(ev => <ScanEventRow key={ev.id} ev={ev} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Master list row ──────────────────────────────────────────────────────────

function SurfaceRow({ surface, selected, onClick }: { surface: Surface; selected: boolean; onClick: () => void }) {
  return (
    <div
      className="j-card j-tight"
      style={{
        cursor: "pointer",
        boxShadow: selected ? "0 0 0 2px var(--j-accent)" : undefined,
      }}
      onClick={onClick}
    >
      <code style={{ fontSize: 11.5, fontFamily: "monospace", display: "block", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {surface.canonical_id}
      </code>
      <div className="j-row j-wrap" style={{ gap: 4 }}>
        <span className={`j-pill ${KIND_PILL[surface.kind] ?? "j-ghost"}`} style={{ fontSize: 10 }}>
          {surface.kind}
        </span>
        <span className={`j-pill ${STATUS_PILL[surface.status]}`} style={{ fontSize: 10 }}>
          {surface.status}
        </span>
        {surface.last_verified_at && (
          <span className="j-pill j-ghost" style={{ fontSize: 10 }}>
            {relTime(surface.last_verified_at)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selected, setSelected] = useState<Surface | null>(null)
  const [lastScan, setLastScan] = useState<CatalogScanEvent | null>(null)

  // Filters
  const [kinds, setKinds] = useState<SurfaceKind[]>([])
  const [status, setStatus] = useState<string>("")
  const [search, setSearch] = useState("")
  const [staleOnly, setStaleOnly] = useState(false)

  // Load last scan event for sync status (non-critical)
  useEffect(() => {
    fetch("/api/catalog/scan-events?limit=1")
      .then(r => r.json())
      .then(json => {
        const events: CatalogScanEvent[] = Array.isArray(json?.data) ? json.data : []
        if (events[0]) setLastScan(events[0])
      })
      .catch(() => { /* non-critical */ })
  }, [])

  // Resolve ?focus param from URL
  useEffect(() => {
    const focus = searchParams.get("focus")
    if (focus && surfaces.length > 0 && !selected) {
      const match = surfaces.find(s => s.canonical_id === focus || s.id === focus)
      if (match) setSelected(match)
    }
  }, [searchParams, surfaces, selected])

  const fetchSurfaces = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const sp = new URLSearchParams()
      if (kinds.length === 1) sp.set("kind", kinds[0])
      if (status) sp.set("status", status)
      if (search.trim()) sp.set("search", search.trim())
      if (staleOnly) sp.set("status", "stale")
      sp.set("limit", "200")
      const res = await fetch(`/api/catalog/surfaces?${sp.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed to load catalog")
      setSurfaces(Array.isArray(json.data) ? json.data : [])
      setTotal(json.meta?.total ?? 0)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load catalog")
    } finally {
      setLoading(false)
    }
  }, [kinds, status, search, staleOnly])

  useEffect(() => { fetchSurfaces() }, [fetchSurfaces])

  const refreshSelected = useCallback(async () => {
    if (!selected) return
    const res = await fetch(`/api/catalog/surfaces/${selected.id}`)
    const json = await res.json()
    if (json.success && json.data) {
      setSelected(json.data)
      setSurfaces(prev => prev.map(s => s.id === selected.id ? json.data : s))
    }
  }, [selected])

  const navigateToSurface = useCallback((canonicalId: string) => {
    const match = surfaces.find(s => s.canonical_id === canonicalId || s.id === canonicalId)
    if (match) {
      setSelected(match)
    } else {
      // Try to fetch by canonical_id
      fetch(`/api/catalog/surfaces/${encodeURIComponent(canonicalId)}`)
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data) {
            setSurfaces(prev => {
              const exists = prev.find(s => s.id === json.data.id)
              return exists ? prev : [json.data, ...prev]
            })
            setSelected(json.data)
          }
        })
        .catch(() => { /* noop */ })
    }
  }, [surfaces])

  const toggleKind = (k: SurfaceKind) => {
    setKinds(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  }

  return (
    <DashboardLayout>
      <div className="j-content">
        {/* Header */}
        <div className="j-row j-between j-wrap" style={{ gap: 12 }}>
          <div className="j-row" style={{ gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Catalog</h1>
            <span className="j-pill j-ghost" style={{ fontSize: 11 }}>{total}</span>
            {lastScan && (
              <div className="j-row" style={{ gap: 6 }}>
                <span className="j-muted" style={{ fontSize: 11 }}>
                  Last scan {relTime(lastScan.scanned_at)}
                </span>
                <span className="j-pill j-ghost" style={{ fontSize: 10 }}>{lastScan.scan_type}</span>
              </div>
            )}
          </div>
          <a href="/impact" className="j-btn j-btn-ghost" style={{ fontSize: 12, textDecoration: "none" }}>
            <Icon name="map" size={13} /> Impact graph
          </a>
        </div>

        {/* Filters */}
        <div className="j-col" style={{ gap: 8 }}>
          {/* Kind chips */}
          <div className="j-row j-wrap" style={{ gap: 5 }}>
            {(SURFACE_KINDS as readonly string[]).map(k => (
              <button
                key={k}
                onClick={() => toggleKind(k as SurfaceKind)}
                style={{
                  padding: "2px 8px",
                  background: kinds.includes(k as SurfaceKind) ? "oklch(0.35 0.08 260)" : "transparent",
                  border: `1px solid ${kinds.includes(k as SurfaceKind) ? "oklch(0.55 0.15 260)" : "var(--j-hairline)"}`,
                  borderRadius: 12,
                  color: kinds.includes(k as SurfaceKind) ? "oklch(0.85 0.12 260)" : "oklch(0.556 0 0)",
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Status + search row */}
          <div className="j-row j-wrap" style={{ gap: 8 }}>
            <div className="j-tabs">
              {["", "fresh", "needs_revalidation", "stale", "deprecated"].map(s => (
                <span
                  key={s}
                  className={`j-tab${status === s && !staleOnly ? " j-active" : ""}`}
                  onClick={() => { setStatus(s); setStaleOnly(false) }}
                >
                  {s || "All"}
                </span>
              ))}
            </div>
            <button
              className={`j-btn ${staleOnly ? "j-btn-primary" : "j-btn-ghost"}`}
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => { setStaleOnly(v => !v); setStatus("") }}
            >
              Stale only
            </button>
            <input
              className="j-search"
              style={{ minWidth: 220 }}
              placeholder="Search canonical_id…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {err && <div className="j-pill j-neg" style={{ alignSelf: "flex-start" }}>{err}</div>}

        {/* Master + Detail */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Master pane */}
          <div style={{ width: 360, flexShrink: 0 }}>
            {loading ? (
              <div className="j-card"><span className="j-muted">Loading…</span></div>
            ) : surfaces.length === 0 ? (
              <div className="j-card j-col" style={{ alignItems: "center", gap: 10, padding: 32 }}>
                <Icon name="layers" size={24} />
                <p className="j-muted" style={{ textAlign: "center", fontSize: 13 }}>
                  No surfaces match the current filters.
                </p>
              </div>
            ) : (
              <div className="j-col" style={{ gap: 6 }}>
                {surfaces.map(s => (
                  <SurfaceRow
                    key={s.id}
                    surface={s}
                    selected={selected?.id === s.id}
                    onClick={() => { setSelected(s); router.replace(`/catalog?focus=${encodeURIComponent(s.canonical_id)}`, { scroll: false }) }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail pane */}
          {selected ? (
            <DetailPane
              surface={selected}
              onClose={() => { setSelected(null); router.replace("/catalog", { scroll: false }) }}
              onNavigate={navigateToSurface}
              onRefresh={refreshSelected}
            />
          ) : (
            <div className="j-card j-col" style={{ flex: 1, alignItems: "center", gap: 10, padding: 48 }}>
              <Icon name="layers" size={28} />
              <p className="j-muted" style={{ textAlign: "center", fontSize: 13 }}>
                Select a surface to inspect
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
