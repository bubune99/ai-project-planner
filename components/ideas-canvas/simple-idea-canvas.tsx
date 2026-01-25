"use client"

import { useCallback, useMemo, useEffect } from "react"
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeTypes,
  MarkerType,
  Handle,
  Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Lightbulb, Layers, FileText, CheckCircle } from "lucide-react"
import type { IdeaWithStats, ViewSettings } from "@/lib/types"

// Custom node component for idea (center node)
function IdeaNode({ data }: { data: { label: string; description?: string } }) {
  return (
    <div className="px-4 py-3 shadow-lg rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 border-2 border-yellow-400 min-w-[200px]">
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-yellow-300" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-yellow-300" />
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-yellow-100" />
        <span className="font-semibold text-white">{data.label}</span>
      </div>
      {data.description && (
        <p className="text-xs text-yellow-100 mt-1 line-clamp-2">{data.description}</p>
      )}
    </div>
  )
}

// Custom node for facets
function FacetNode({ data }: { data: { label: string; type: string; content?: string } }) {
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      pros_cons: "from-green-500 to-emerald-600 border-green-400",
      timeline: "from-blue-500 to-cyan-600 border-blue-400",
      market_research: "from-purple-500 to-violet-600 border-purple-400",
      technical_specs: "from-orange-500 to-red-600 border-orange-400",
      financials: "from-emerald-500 to-teal-600 border-emerald-400",
      dependencies: "from-indigo-500 to-blue-600 border-indigo-400",
      risks: "from-red-500 to-pink-600 border-red-400",
      alternatives: "from-cyan-500 to-sky-600 border-cyan-400",
      custom: "from-gray-500 to-slate-600 border-gray-400",
    }
    return colors[type] || colors.custom
  }

  return (
    <div
      className={`px-3 py-2 shadow-md rounded-lg bg-gradient-to-br ${getTypeColor(data.type)} border-2 min-w-[150px]`}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-white" />
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-white" />
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-white/80" />
        <span className="font-medium text-white text-sm">{data.label}</span>
      </div>
      {data.content && <p className="text-xs text-white/70 mt-1 line-clamp-2">{data.content}</p>}
    </div>
  )
}

// Custom node for content/notes
function ContentNode({ data }: { data: { label: string; content?: string } }) {
  return (
    <div className="px-3 py-2 shadow-md rounded-lg bg-card border border-border min-w-[120px]">
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-primary" />
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium text-sm">{data.label}</span>
      </div>
      {data.content && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.content}</p>}
    </div>
  )
}

// Custom node for validations
function ValidationNode({ data }: { data: { label: string; status: string } }) {
  const statusColors: Record<string, string> = {
    validated: "bg-green-500/20 border-green-500 text-green-400",
    pending: "bg-yellow-500/20 border-yellow-500 text-yellow-400",
    needs_revision: "bg-red-500/20 border-red-500 text-red-400",
  }

  return (
    <div className={`px-3 py-2 shadow-md rounded-lg border ${statusColors[data.status] || statusColors.pending}`}>
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-current" />
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  ideaNode: IdeaNode,
  facetNode: FacetNode,
  contentNode: ContentNode,
  validationNode: ValidationNode,
}

interface SimpleIdeaCanvasProps {
  idea: IdeaWithStats
  viewSettings: ViewSettings
  onStatsChange?: (stats: {
    totalNodes: number
    nodesByType: { ideas: number; facets: number; validations: number; content: number }
    totalConnections: number
  }) => void
}

export function SimpleIdeaCanvas({ idea, viewSettings, onStatsChange }: SimpleIdeaCanvasProps) {
  // Build nodes from idea data
  const initialNodes = useMemo(() => {
    const nodes: Node[] = []
    const facets = idea.facets || []

    // Center idea node
    nodes.push({
      id: "idea-main",
      type: "ideaNode",
      position: { x: 250, y: 200 },
      data: {
        label: idea.title,
        description: idea.description || idea.core_content || "",
      },
    })

    // Facet nodes arranged in a circle around the idea
    const facetRadius = 250
    facets.forEach((facet, index) => {
      const angle = (index * 2 * Math.PI) / Math.max(facets.length, 1) - Math.PI / 2
      const x = 250 + facetRadius * Math.cos(angle)
      const y = 200 + facetRadius * Math.sin(angle)

      nodes.push({
        id: `facet-${facet.id}`,
        type: "facetNode",
        position: { x, y },
        data: {
          label: facet.name || facet.facetType.replace(/_/g, " "),
          type: facet.facetType,
          content:
            typeof facet.data === "object"
              ? JSON.stringify(facet.data).slice(0, 50)
              : String(facet.data || "").slice(0, 50),
        },
      })
    })

    return nodes
  }, [idea])

  // Build edges connecting idea to facets
  const initialEdges = useMemo(() => {
    const edges: Edge[] = []
    const facets = idea.facets || []

    facets.forEach((facet) => {
      edges.push({
        id: `edge-idea-${facet.id}`,
        source: "idea-main",
        target: `facet-${facet.id}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#f59e0b", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#f59e0b",
        },
      })
    })

    return edges
  }, [idea])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when idea changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Report stats
  useEffect(() => {
    if (onStatsChange) {
      const facetCount = (idea.facets || []).length
      onStatsChange({
        totalNodes: 1 + facetCount,
        nodesByType: {
          ideas: 1,
          facets: facetCount,
          validations: 0,
          content: 0,
        },
        totalConnections: facetCount,
      })
    }
  }, [idea, onStatsChange])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      className="bg-background"
    >
      {viewSettings.showControls && <Controls />}
      {viewSettings.showMinimap && (
        <MiniMap
          nodeStrokeColor={(n) => {
            if (n.type === "ideaNode") return "#f59e0b"
            if (n.type === "facetNode") return "#8b5cf6"
            return "#6b7280"
          }}
          nodeColor={(n) => {
            if (n.type === "ideaNode") return "#fbbf24"
            if (n.type === "facetNode") return "#a78bfa"
            return "#9ca3af"
          }}
          nodeBorderRadius={8}
        />
      )}
      <Background color="var(--muted-foreground)" gap={20} size={1} />
    </ReactFlow>
  )
}
