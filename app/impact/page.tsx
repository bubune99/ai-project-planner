"use client"

/**
 * /impact — Catalog Impact Graph (Idea H Wave 5)
 *
 * ReactFlow graph of surfaces (nodes) + dependencies (edges).
 * Supports focus mode (hops), kind/dep-kind filters, conflict highlighting.
 * Query state: ?focus=<canonical_id>&hops=2&kinds=db_table,api_route&relations=reads_from
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Position,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Filter, RefreshCw, X, Search } from "lucide-react"
import type { Surface, SurfaceDependency, SurfaceKind } from "@/lib/catalog/types"
import { SURFACE_KINDS, DEPENDENCY_KINDS } from "@/lib/catalog/types"

// ── Colour palette by surface kind ──────────────────────────────────────────

const KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  db_table:         { bg: "rgba(168, 85, 247, 0.18)",  border: "#a855f7", text: "#e9d5ff" },
  db_column:        { bg: "rgba(139, 92, 246, 0.15)",  border: "#7c3aed", text: "#ddd6fe" },
  db_enum:          { bg: "rgba(109, 40, 217, 0.15)",  border: "#6d28d9", text: "#ede9fe" },
  db_matview:       { bg: "rgba(124, 58, 237, 0.18)",  border: "#7c3aed", text: "#ede9fe" },
  db_function:      { bg: "rgba(91, 33, 182, 0.18)",   border: "#5b21b6", text: "#ddd6fe" },
  api_route:        { bg: "rgba(34, 197, 94, 0.18)",   border: "#22c55e", text: "#dcfce7" },
  mcp_tool:         { bg: "rgba(20, 184, 166, 0.18)",  border: "#14b8a6", text: "#ccfbf1" },
  middleware:       { bg: "rgba(234, 179, 8, 0.18)",   border: "#eab308", text: "#fef9c3" },
  ui_page:          { bg: "rgba(59, 130, 246, 0.18)",  border: "#3b82f6", text: "#dbeafe" },
  ui_component:     { bg: "rgba(37, 99, 235, 0.18)",   border: "#2563eb", text: "#bfdbfe" },
  nav_link:         { bg: "rgba(96, 165, 250, 0.15)",  border: "#60a5fa", text: "#e0f2fe" },
  env_var:          { bg: "rgba(245, 158, 11, 0.18)",  border: "#f59e0b", text: "#fef3c7" },
  feature_flag:     { bg: "rgba(217, 119, 6, 0.18)",   border: "#d97706", text: "#fde68a" },
  config_file:      { bg: "rgba(148, 163, 184, 0.15)", border: "#94a3b8", text: "#e2e8f0" },
  integration:      { bg: "rgba(239, 68, 68, 0.18)",   border: "#ef4444", text: "#fee2e2" },
  webhook_endpoint: { bg: "rgba(220, 38, 38, 0.18)",   border: "#dc2626", text: "#fecaca" },
  helper:           { bg: "rgba(100, 116, 139, 0.15)", border: "#64748b", text: "#cbd5e1" },
  type_export:      { bg: "rgba(71, 85, 105, 0.15)",   border: "#475569", text: "#cbd5e1" },
  zod_schema:       { bg: "rgba(251, 191, 36, 0.18)",  border: "#fbbf24", text: "#fef3c7" },
  react_hook:       { bg: "rgba(6, 182, 212, 0.18)",   border: "#06b6d4", text: "#cffafe" },
  default:          { bg: "rgba(148, 163, 184, 0.18)", border: "#94a3b8", text: "#e2e8f0" },
}

// ── Layout: concentric by kind (most-connected first) ───────────────────────

function layoutNodes(
  surfaces: Surface[],
  deps: SurfaceDependency[],
): { nodes: Node[]; edges: Edge[] } {
  // Count connections per surface for ring ordering
  const connCount: Record<string, number> = {}
  for (const dep of deps) {
    connCount[dep.from_surface_id] = (connCount[dep.from_surface_id] ?? 0) + 1
    connCount[dep.to_surface_id] = (connCount[dep.to_surface_id] ?? 0) + 1
  }

  // Group by kind
  const byKind: Record<string, Surface[]> = {}
  for (const s of surfaces) {
    if (!byKind[s.kind]) byKind[s.kind] = []
    byKind[s.kind].push(s)
  }

  const kindKeys = Object.keys(byKind).sort(
    (a, b) => byKind[b].length - byKind[a].length
  )
  const kindIndex: Record<string, number> = {}
  kindKeys.forEach((k, i) => (kindIndex[k] = i))

  const baseRadius = 240
  const ringStep = 170
  const flowNodes: Node[] = []

  for (const [kind, group] of Object.entries(byKind)) {
    const ring = kindIndex[kind] ?? 0
    const r = baseRadius + ring * ringStep
    const angleStep = (2 * Math.PI) / Math.max(group.length, 1)
    const colors = KIND_COLORS[kind] ?? KIND_COLORS.default

    group.forEach((s, i) => {
      const angle = i * angleStep
      flowNodes.push({
        id: s.id,
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: {
          label: s.canonical_id.split("/").pop() ?? s.canonical_id,
          fullId: s.canonical_id,
          kind: s.kind,
          status: s.status,
          surface: s,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: colors.bg,
          border: `1.5px solid ${colors.border}`,
          color: colors.text,
          padding: "6px 10px",
          borderRadius: 8,
          fontSize: 11,
          maxWidth: 180,
          fontFamily: "var(--j-mono, ui-monospace, monospace)",
        },
      })
    })
  }

  const idToSurface = new Map(surfaces.map(s => [s.id, s]))
  const flowEdges: Edge[] = deps.map((d) => {
    const fromSurface = idToSurface.get(d.from_surface_id)
    const toSurface = idToSurface.get(d.to_surface_id)
    if (!fromSurface || !toSurface) return null
    return {
      id: d.id,
      source: d.from_surface_id,
      target: d.to_surface_id,
      label: d.kind,
      labelStyle: { fontSize: 9, fill: "#94a3b8", fontFamily: "var(--j-mono, monospace)" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      labelBgStyle: { fill: "rgba(15, 23, 42, 0.7)" },
      style: { stroke: "#475569", strokeWidth: Math.max(1, (d.confidence ?? 0.5) * 2) },
      type: "default",
    }
  }).filter((e): e is Edge => e !== null)

  return { nodes: flowNodes, edges: flowEdges }
}

// ── Filter surfaces/deps by focus + hops ────────────────────────────────────

function applyFocusFilter(
  surfaces: Surface[],
  deps: SurfaceDependency[],
  focusCanonical: string,
  hops: number,
): { surfaces: Surface[]; deps: SurfaceDependency[] } {
  const focusSurface = surfaces.find(s => s.canonical_id === focusCanonical)
  if (!focusSurface) return { surfaces, deps }

  const included = new Set<string>([focusSurface.id])
  let frontier = new Set<string>([focusSurface.id])

  for (let h = 0; h < hops; h++) {
    const next = new Set<string>()
    for (const dep of deps) {
      if (frontier.has(dep.from_surface_id) && !included.has(dep.to_surface_id)) {
        next.add(dep.to_surface_id)
        included.add(dep.to_surface_id)
      }
      if (frontier.has(dep.to_surface_id) && !included.has(dep.from_surface_id)) {
        next.add(dep.from_surface_id)
        included.add(dep.from_surface_id)
      }
    }
    frontier = next
    if (next.size === 0) break
  }

  return {
    surfaces: surfaces.filter(s => included.has(s.id)),
    deps: deps.filter(d => included.has(d.from_surface_id) && included.has(d.to_surface_id)),
  }
}

// ── Detect conflict edges (surfaces sharing dependents) ──────────────────────

function detectConflictIds(deps: SurfaceDependency[]): Set<string> {
  // A conflict: two surfaces both depend on a third (shared downstream)
  const dependentMap: Record<string, Set<string>> = {}
  for (const d of deps) {
    if (!dependentMap[d.to_surface_id]) dependentMap[d.to_surface_id] = new Set()
    dependentMap[d.to_surface_id].add(d.from_surface_id)
  }
  const conflictSurfaces = new Set<string>()
  for (const [, fromSet] of Object.entries(dependentMap)) {
    if (fromSet.size > 1) {
      for (const id of fromSet) conflictSurfaces.add(id)
    }
  }
  // Highlight edges between any two conflict surfaces
  const conflictEdges = new Set<string>()
  for (const d of deps) {
    if (conflictSurfaces.has(d.from_surface_id) && conflictSurfaces.has(d.to_surface_id)) {
      conflictEdges.add(d.id)
    }
  }
  return conflictEdges
}

// ── Selected node panel ──────────────────────────────────────────────────────

function NodeDetailPanel({ surface, onClose }: { surface: Surface; onClose: () => void }) {
  const loc = surface.location ?? {}
  return (
    <div style={{
      width: 300,
      background: "var(--j-surface, #0f172a)",
      borderLeft: "1px solid var(--j-border, #1f2937)",
      padding: 16,
      overflowY: "auto",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
          {surface.kind}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <code style={{ fontSize: 12, fontFamily: "monospace", display: "block", wordBreak: "break-all", color: "#e2e8f0", marginBottom: 8 }}>
        {surface.canonical_id}
      </code>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, background: "rgba(148,163,184,0.15)", color: "#94a3b8", border: "1px solid #334155" }}>
          {surface.status}
        </span>
      </div>
      {loc.file_path && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>FILE</div>
          <code style={{ fontSize: 11, fontFamily: "monospace", color: "#60a5fa", wordBreak: "break-all" }}>
            {loc.file_path as string}
          </code>
        </div>
      )}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <a
          href={`/catalog?focus=${encodeURIComponent(surface.canonical_id)}`}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            borderRadius: 4, color: "#e2e8f0", fontSize: 12, textDecoration: "none", cursor: "pointer",
          }}
        >
          Open in catalog
        </a>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
          ID: <code style={{ fontSize: 10 }}>{surface.id.slice(0, 12)}…</code>
        </div>
      </div>
    </div>
  )
}

// ── Shared button style ──────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px",
  background: "var(--j-surface-elevated, #1f2937)", border: "1px solid var(--j-border, #334155)",
  borderRadius: 4, color: "var(--j-text, #e2e8f0)", fontSize: 12, cursor: "pointer",
}

const inputStyle: React.CSSProperties = {
  background: "var(--j-surface, #0f172a)", border: "1px solid var(--j-border, #334155)",
  borderRadius: 4, padding: "6px 8px", color: "var(--j-text, #e2e8f0)",
  fontSize: 12, fontFamily: "monospace",
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 6,
}

function chipStyle(active: boolean, accent?: string): React.CSSProperties {
  return {
    padding: "3px 8px", background: active ? "rgba(30,41,59,0.9)" : "transparent",
    border: `1px solid ${active ? accent ?? "#3b82f6" : "#334155"}`,
    borderRadius: 12, color: active ? accent ?? "#3b82f6" : "#94a3b8",
    fontSize: 10, cursor: "pointer", fontFamily: "monospace",
  }
}

const overlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center",
  justifyContent: "center", gap: 8, color: "#94a3b8", fontSize: 13,
  flexDirection: "column", textAlign: "center", padding: 24,
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ImpactGraphPage() {
  const [allSurfaces, setAllSurfaces] = useState<Surface[]>([])
  const [allDeps, setAllDeps] = useState<SurfaceDependency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [kindFilter, setKindFilter] = useState<SurfaceKind[]>([])
  const [depKindFilter, setDepKindFilter] = useState<string[]>([])
  const [focusInput, setFocusInput] = useState("")
  const [focusCanonical, setFocusCanonical] = useState("")
  const [hops, setHops] = useState(2)
  const [showConflicts, setShowConflicts] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedSurface, setSelectedSurface] = useState<Surface | null>(null)

  // Read query string on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const focus = sp.get("focus") ?? ""
    const hopsParam = Number(sp.get("hops") ?? "2")
    const kindsParam = sp.get("kinds") ?? ""
    const relsParam = sp.get("relations") ?? ""

    if (focus) { setFocusInput(focus); setFocusCanonical(focus) }
    if (!Number.isNaN(hopsParam) && hopsParam > 0) setHops(Math.min(hopsParam, 3))
    if (kindsParam) setKindFilter(kindsParam.split(",").filter(k => SURFACE_KINDS.includes(k as SurfaceKind)) as SurfaceKind[])
    if (relsParam) setDepKindFilter(relsParam.split(",").filter(r => DEPENDENCY_KINDS.includes(r as never)))
  }, [])

  // Sync query string
  const syncQS = useCallback((params: Record<string, string>) => {
    const sp = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    window.history.replaceState(null, "", `?${sp.toString()}`)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [surfRes, depRes] = await Promise.all([
        fetch("/api/catalog/surfaces?limit=500"),
        fetch("/api/catalog/dependencies?limit=2000"),
      ])
      const [surfJson, depJson] = await Promise.all([surfRes.json(), depRes.json()])
      if (!surfJson.success) throw new Error(surfJson.error?.message ?? "Failed to load surfaces")
      setAllSurfaces(Array.isArray(surfJson.data) ? surfJson.data : [])
      setAllDeps(Array.isArray(depJson.data) ? depJson.data : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Apply filters
  const filteredSurfaces = useMemo(() => {
    let s = allSurfaces
    if (kindFilter.length > 0) s = s.filter(x => kindFilter.includes(x.kind))
    return s
  }, [allSurfaces, kindFilter])

  const filteredDeps = useMemo(() => {
    let d = allDeps
    if (depKindFilter.length > 0) d = d.filter(x => depKindFilter.includes(x.kind))
    const surfIds = new Set(filteredSurfaces.map(s => s.id))
    d = d.filter(x => surfIds.has(x.from_surface_id) && surfIds.has(x.to_surface_id))
    return d
  }, [allDeps, filteredSurfaces, depKindFilter])

  // Apply focus
  const { surfaces: visibleSurfaces, deps: visibleDeps } = useMemo(() => {
    if (!focusCanonical) return { surfaces: filteredSurfaces, deps: filteredDeps }
    return applyFocusFilter(filteredSurfaces, filteredDeps, focusCanonical, hops)
  }, [filteredSurfaces, filteredDeps, focusCanonical, hops])

  // Compute conflict edges
  const conflictEdgeIds = useMemo(() => {
    if (!showConflicts) return new Set<string>()
    return detectConflictIds(visibleDeps)
  }, [visibleDeps, showConflicts])

  // Layout
  const { nodes, edges } = useMemo(() => {
    const layout = layoutNodes(visibleSurfaces, visibleDeps)
    // Apply conflict highlighting
    if (showConflicts && conflictEdgeIds.size > 0) {
      const styledEdges = layout.edges.map(e => ({
        ...e,
        style: conflictEdgeIds.has(e.id)
          ? { ...e.style, stroke: "#ef4444", strokeWidth: 2 }
          : e.style,
        animated: conflictEdgeIds.has(e.id),
      }))
      return { nodes: layout.nodes, edges: styledEdges }
    }
    return layout
  }, [visibleSurfaces, visibleDeps, showConflicts, conflictEdgeIds])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const s = allSurfaces.find(x => x.id === node.id)
    if (s) setSelectedSurface(s)
  }, [allSurfaces])

  const allKinds = useMemo(() => {
    const seen = new Set(allSurfaces.map(s => s.kind))
    return SURFACE_KINDS.filter(k => seen.has(k))
  }, [allSurfaces])

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0f1c" }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid #1f2937",
        background: "#0f172a", display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
      }}>
        <a href="/catalog" style={{ color: "#64748b", fontSize: 12, textDecoration: "none" }}>← Catalog</a>
        <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600, color: "#e2e8f0" }}>Impact Graph</h1>
        {!loading && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {visibleSurfaces.length} surfaces · {visibleDeps.length} deps
          </span>
        )}
        {focusCanonical && (
          <span style={{ fontSize: 11, color: "#60a5fa", fontFamily: "monospace", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            focus: {focusCanonical}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowConflicts(v => !v)}
          style={{ ...btnStyle, color: showConflicts ? "#ef4444" : "#e2e8f0", borderColor: showConflicts ? "#ef4444" : "#334155" }}
        >
          Conflicts
        </button>
        <button onClick={() => setFiltersOpen(v => !v)} style={btnStyle}>
          <Filter size={14} /> Filters
        </button>
        <button onClick={fetchData} style={btnStyle} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div style={{
          padding: "12px 20px", background: "#111827", borderBottom: "1px solid #1f2937",
          display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", flexShrink: 0,
        }}>
          <div>
            <div style={labelStyle}>Surface kinds</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 600 }}>
              {allKinds.map(k => (
                <button
                  key={k}
                  onClick={() => {
                    setKindFilter(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
                    syncQS({ kinds: kindFilter.join(",") })
                  }}
                  style={chipStyle(kindFilter.includes(k), KIND_COLORS[k]?.border)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Dependency kinds</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 500 }}>
              {(DEPENDENCY_KINDS as readonly string[]).map(r => (
                <button
                  key={r}
                  onClick={() => setDepKindFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                  style={chipStyle(depKindFilter.includes(r))}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Focus surface</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={focusInput}
                onChange={e => setFocusInput(e.target.value)}
                placeholder="canonical_id"
                style={{ ...inputStyle, width: 260 }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    setFocusCanonical(focusInput)
                    syncQS({ focus: focusInput })
                  }
                }}
              />
              <button
                onClick={() => { setFocusCanonical(focusInput); syncQS({ focus: focusInput }) }}
                style={btnStyle}
              >
                <Search size={13} />
              </button>
              {focusCanonical && (
                <button
                  onClick={() => { setFocusCanonical(""); setFocusInput(""); syncQS({ focus: "" }) }}
                  style={{ ...btnStyle, color: "#f87171" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Hops (focus)</div>
            <div style={{ display: "flex", gap: 5 }}>
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => { setHops(n); syncQS({ hops: String(n) }) }}
                  style={chipStyle(hops === n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          {loading && (
            <div style={overlayStyle}>
              <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
              Loading catalog…
            </div>
          )}
          {error && (
            <div style={{ ...overlayStyle, color: "#f87171" }}>
              {error}
              <button onClick={fetchData} style={btnStyle}>Retry</button>
            </div>
          )}
          {!loading && !error && visibleSurfaces.length === 0 && (
            <div style={overlayStyle}>
              No surfaces to display.{" "}
              {allSurfaces.length > 0 ? "Adjust filters or focus to see nodes." : "Register surfaces via the catalog scanner."}
            </div>
          )}
          {!loading && !error && visibleSurfaces.length > 0 && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.05}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="#1e293b" />
              <Controls />
              <MiniMap nodeStrokeWidth={2} maskColor="rgba(10,15,28,0.8)" />
            </ReactFlow>
          )}
        </div>

        {/* Selected surface panel */}
        {selectedSurface && (
          <NodeDetailPanel surface={selectedSurface} onClose={() => setSelectedSurface(null)} />
        )}
      </div>

      {/* Spin keyframes */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
