"use client"

/**
 * /graph — Knowledge graph visualization (Phase 8 / Gap #3).
 *
 * Renders the cross-link graph from /api/knowledge-graph using @xyflow/react.
 * Closes the long-standing visualization gap from the planner-meta roadmap.
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
import { Search, RefreshCw, Filter, X } from "lucide-react"

type GraphNode = {
  id: string
  type: string
  title: string
  summary?: string
  metadata: Record<string, unknown>
}

type GraphEdge = {
  id: string
  source: string
  target: string
  sourceType: string
  targetType: string
  type: string
  confidence: number
  createdAt: string
}

type GraphResponse = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: { nodes: number; edges: number; byType: Record<string, number> }
}

// Colour palette per entity type (j-* friendly muted tones)
const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  idea: { bg: "rgba(168, 85, 247, 0.18)", border: "#a855f7", text: "#e9d5ff" },
  todo: { bg: "rgba(59, 130, 246, 0.18)", border: "#3b82f6", text: "#dbeafe" },
  project: { bg: "rgba(34, 197, 94, 0.18)", border: "#22c55e", text: "#dcfce7" },
  sop: { bg: "rgba(234, 179, 8, 0.18)", border: "#eab308", text: "#fef9c3" },
  decision: { bg: "rgba(244, 63, 94, 0.18)", border: "#f43f5e", text: "#ffe4e6" },
  feature_template: { bg: "rgba(6, 182, 212, 0.18)", border: "#06b6d4", text: "#cffafe" },
  skill: { bg: "rgba(20, 184, 166, 0.18)", border: "#14b8a6", text: "#ccfbf1" },
  protocol: { bg: "rgba(249, 115, 22, 0.18)", border: "#f97316", text: "#ffedd5" },
  work_order: { bg: "rgba(99, 102, 241, 0.18)", border: "#6366f1", text: "#e0e7ff" },
  work_order_step: { bg: "rgba(139, 92, 246, 0.18)", border: "#8b5cf6", text: "#ede9fe" },
  prompt: { bg: "rgba(236, 72, 153, 0.18)", border: "#ec4899", text: "#fce7f3" },
  client: { bg: "rgba(132, 204, 22, 0.18)", border: "#84cc16", text: "#ecfccb" },
  service_schedule: { bg: "rgba(101, 163, 13, 0.18)", border: "#65a30d", text: "#d9f99d" },
  feedback: { bg: "rgba(217, 70, 239, 0.18)", border: "#d946ef", text: "#f5d0fe" },
  idea_facet: { bg: "rgba(167, 139, 250, 0.18)", border: "#a78bfa", text: "#ede9fe" },
  idea_refinement: { bg: "rgba(192, 132, 252, 0.18)", border: "#c084fc", text: "#f3e8ff" },
  idea_document: { bg: "rgba(216, 180, 254, 0.18)", border: "#d8b4fe", text: "#fae8ff" },
  default: { bg: "rgba(148, 163, 184, 0.18)", border: "#94a3b8", text: "#e2e8f0" },
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
]

// ── Layout: concentric circles by type, scattered angle ────────────────────
function layoutNodes(graph: GraphResponse): { nodes: Node[]; edges: Edge[] } {
  const typeKeys = Object.keys(graph.counts.byType).sort(
    (a, b) => graph.counts.byType[b] - graph.counts.byType[a]
  )
  const typeIndex: Record<string, number> = {}
  typeKeys.forEach((t, i) => (typeIndex[t] = i))

  // Group nodes by type
  const byType: Record<string, GraphNode[]> = {}
  for (const n of graph.nodes) {
    if (!byType[n.type]) byType[n.type] = []
    byType[n.type].push(n)
  }

  const flowNodes: Node[] = []
  const baseRadius = 220
  const ringStep = 160

  for (const [type, group] of Object.entries(byType)) {
    const ring = typeIndex[type] ?? 0
    const r = baseRadius + ring * ringStep
    const angleStep = (2 * Math.PI) / Math.max(group.length, 1)
    group.forEach((n, i) => {
      const angle = i * angleStep
      const colors = TYPE_COLORS[n.type] ?? TYPE_COLORS.default
      flowNodes.push({
        id: n.id,
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: { label: n.title, type: n.type, summary: n.summary, metadata: n.metadata },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: colors.bg,
          border: `1.5px solid ${colors.border}`,
          color: colors.text,
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 12,
          maxWidth: 220,
          fontFamily: "var(--j-mono, ui-monospace, monospace)",
        },
      })
    })
  }

  const flowEdges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.type,
    labelStyle: { fontSize: 9, fill: "#94a3b8", fontFamily: "var(--j-mono, monospace)" },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 3,
    labelBgStyle: { fill: "rgba(15, 23, 42, 0.7)" },
    style: { stroke: "#475569", strokeWidth: e.confidence },
    type: "default",
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

export default function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([])
  const [relationTypeFilter, setRelationTypeFilter] = useState<string[]>([])
  const [focusInput, setFocusInput] = useState("")
  const [focusedEntity, setFocusedEntity] = useState<{ type: string; id: string } | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const fetchGraph = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sp = new URLSearchParams()
      if (entityTypeFilter.length) sp.set("entityTypes", entityTypeFilter.join(","))
      if (relationTypeFilter.length) sp.set("relationTypes", relationTypeFilter.join(","))
      if (focusedEntity) {
        sp.set("focusEntityType", focusedEntity.type)
        sp.set("focusEntityId", focusedEntity.id)
      }
      sp.set("limit", "500")
      const r = await fetch(`/api/knowledge-graph?${sp.toString()}`)
      const json = await r.json()
      if (!json.success) throw new Error(json.error?.message ?? "Graph fetch failed")
      setGraph(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [entityTypeFilter, relationTypeFilter, focusedEntity])

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    return layoutNodes(graph)
  }, [graph])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const original = graph?.nodes.find((n) => n.id === node.id)
      if (original) setSelectedNode(original)
    },
    [graph]
  )

  const focusOnSelected = () => {
    if (selectedNode) setFocusedEntity({ type: selectedNode.type, id: selectedNode.id })
  }

  const clearFocus = () => {
    setFocusedEntity(null)
    setSelectedNode(null)
  }

  const allTypes = useMemo(() => {
    if (!graph) return [] as string[]
    return Object.keys(graph.counts.byType).sort()
  }, [graph])

  return (
    <div className="j-page" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--j-border, #1f2937)",
          background: "var(--j-surface, #0f172a)",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <h1 className="j-h1" style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>
          Knowledge Graph
        </h1>
        {graph && (
          <span style={{ fontSize: 12, color: "var(--j-muted, #94a3b8)" }}>
            {graph.counts.nodes} nodes · {graph.counts.edges} edges
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setFiltersOpen((v) => !v)} className="j-btn" style={btnStyle}>
          <Filter size={14} /> Filters
        </button>
        <button onClick={fetchGraph} className="j-btn" style={btnStyle}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div
          style={{
            padding: "12px 24px",
            background: "var(--j-surface-elevated, #111827)",
            borderBottom: "1px solid var(--j-border, #1f2937)",
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={labelStyle}>Entity types</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 600 }}>
              {allTypes.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setEntityTypeFilter((cur) =>
                      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
                    )
                  }
                  style={chipStyle(entityTypeFilter.includes(t), TYPE_COLORS[t]?.border)}
                >
                  {t} ({graph?.counts.byType[t] ?? 0})
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Relation types</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 480 }}>
              {RELATION_TYPES.map((r) => (
                <button
                  key={r}
                  onClick={() =>
                    setRelationTypeFilter((cur) =>
                      cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]
                    )
                  }
                  style={chipStyle(relationTypeFilter.includes(r))}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Focus on entity</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={focusInput}
                onChange={(e) => setFocusInput(e.target.value)}
                placeholder="type:uuid (e.g. idea:abc-…)"
                style={{ ...inputStyle, width: 220 }}
              />
              <button
                onClick={() => {
                  const [type, id] = focusInput.split(":")
                  if (type && id) setFocusedEntity({ type, id })
                }}
                style={btnStyle}
              >
                <Search size={14} />
              </button>
              {focusedEntity && (
                <button onClick={clearFocus} style={{ ...btnStyle, color: "#f87171" }}>
                  <X size={14} />
                </button>
              )}
            </div>
            {focusedEntity && (
              <div style={{ fontSize: 10, color: "var(--j-muted, #94a3b8)", marginTop: 4 }}>
                Focused: {focusedEntity.type}/{focusedEntity.id.slice(0, 8)} (2-hop view)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", position: "relative" }}>
        <div style={{ flex: 1, background: "#0a0f1c" }}>
          {loading && (
            <div style={overlayStyle}>
              <RefreshCw size={20} className="j-spin" /> Loading graph…
            </div>
          )}
          {error && (
            <div style={{ ...overlayStyle, color: "#f87171" }}>
              {error} <button onClick={fetchGraph} style={btnStyle}>Retry</button>
            </div>
          )}
          {!loading && !error && graph && graph.nodes.length === 0 && (
            <div style={overlayStyle}>
              No entity relations yet. Create one via{" "}
              <code style={{ background: "#1f2937", padding: "2px 6px", borderRadius: 3 }}>
                POST /api/entity-relations
              </code>{" "}
              or via cross-link UI on an idea detail page (Phase 5).
            </div>
          )}
          {!loading && !error && graph && graph.nodes.length > 0 && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="#1e293b" />
              <Controls />
              <MiniMap nodeStrokeWidth={2} maskColor="rgba(15, 23, 42, 0.8)" />
            </ReactFlow>
          )}
        </div>

        {/* Selected node detail panel */}
        {selectedNode && (
          <div
            style={{
              width: 320,
              background: "var(--j-surface, #0f172a)",
              borderLeft: "1px solid var(--j-border, #1f2937)",
              padding: 16,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--j-muted, #94a3b8)", textTransform: "uppercase", letterSpacing: 1 }}>
                {selectedNode.type}
              </span>
              <button onClick={() => setSelectedNode(null)} style={iconBtnStyle}>
                <X size={14} />
              </button>
            </div>
            <h3 style={{ margin: "8px 0", fontSize: 14, fontWeight: 600, color: "var(--j-text, #e2e8f0)" }}>
              {selectedNode.title}
            </h3>
            {selectedNode.summary && (
              <p style={{ fontSize: 12, color: "var(--j-muted, #94a3b8)", lineHeight: 1.5 }}>
                {selectedNode.summary}
              </p>
            )}
            {Object.keys(selectedNode.metadata).length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11 }}>
                {Object.entries(selectedNode.metadata).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "var(--j-muted, #94a3b8)" }}>{k}</span>
                    <span style={{ color: "var(--j-text, #e2e8f0)", fontFamily: "monospace" }}>
                      {String(v ?? "")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={focusOnSelected} style={{ ...btnStyle, justifyContent: "center" }}>
                Focus on this node (2-hop)
              </button>
              <div style={{ fontSize: 10, color: "var(--j-muted, #94a3b8)", marginTop: 4 }}>
                ID: <code>{selectedNode.id}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 10px",
  background: "var(--j-surface-elevated, #1f2937)",
  border: "1px solid var(--j-border, #334155)",
  borderRadius: 4,
  color: "var(--j-text, #e2e8f0)",
  fontSize: 12,
  cursor: "pointer",
}

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--j-muted, #94a3b8)",
  cursor: "pointer",
  padding: 2,
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--j-muted, #94a3b8)",
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  background: "var(--j-surface, #0f172a)",
  border: "1px solid var(--j-border, #334155)",
  borderRadius: 4,
  padding: "6px 8px",
  color: "var(--j-text, #e2e8f0)",
  fontSize: 12,
  fontFamily: "monospace",
}

function chipStyle(active: boolean, accent?: string): React.CSSProperties {
  return {
    padding: "3px 8px",
    background: active ? "var(--j-accent-bg, #1e293b)" : "transparent",
    border: `1px solid ${active ? accent ?? "var(--j-accent, #3b82f6)" : "var(--j-border, #334155)"}`,
    borderRadius: 12,
    color: active ? accent ?? "var(--j-accent, #3b82f6)" : "var(--j-muted, #94a3b8)",
    fontSize: 10,
    cursor: "pointer",
    fontFamily: "monospace",
  }
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  color: "var(--j-muted, #94a3b8)",
  fontSize: 13,
  flexDirection: "column",
  textAlign: "center",
  padding: 24,
}
