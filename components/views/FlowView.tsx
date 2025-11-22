"use client"

import type React from "react"

import { useCallback, useState, useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  MarkerType,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { Target, Zap } from "lucide-react"
import { PhaseNode } from "./PhaseNode"
import { TaskNode } from "./TaskNode"
import type { Task } from "@/lib/types"
import type { Node, Edge } from "@xyflow/react"

const nodeTypes = {
  phaseNode: PhaseNode,
  taskNode: TaskNode,
}

interface FlowViewProps {
  nodes?: Node[]
  edges?: Edge[]
  onTaskSelect?: (task: Task | null) => void
}

export function FlowView({ nodes: initialNodes, edges: initialEdges, onTaskSelect }: FlowViewProps) {
  const flowNodes = Array.isArray(initialNodes) && initialNodes.length > 0 ? initialNodes : []
  const flowEdges = Array.isArray(initialEdges) && initialEdges.length > 0 ? initialEdges : []

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)
  const [highlightMode, setHighlightMode] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id)
      if (node.data.type === "task" && onTaskSelect) {
        // Create a minimal task object for the AI assistant
        const task: Task = {
          id: node.id,
          name: node.data.label,
          description: "",
          agent: node.data.agent?.name || "v0",
          status: node.data.status || "pending",
          estimatedTime: "30 min",
          dependencies: [],
        }
        onTaskSelect(task)
      }
    },
    [onTaskSelect],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    if (onTaskSelect) {
      onTaskSelect(null)
    }
  }, [onTaskSelect])

  // Calculate highlighted nodes when in highlight mode
  const highlightedNodes = useMemo(() => {
    if (!highlightMode || !selectedNodeId) return new Set<string>()

    const highlighted = new Set<string>([selectedNodeId])

    // Find upstream dependencies
    const findUpstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.target === nodeId && !highlighted.has(edge.source)) {
          highlighted.add(edge.source)
          findUpstream(edge.source)
        }
      })
    }

    // Find downstream dependencies
    const findDownstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.source === nodeId && !highlighted.has(edge.target)) {
          highlighted.add(edge.target)
          findDownstream(edge.target)
        }
      })
    }

    findUpstream(selectedNodeId)
    findDownstream(selectedNodeId)

    return highlighted
  }, [highlightMode, selectedNodeId, edges])

  // Apply styling based on highlight mode
  const styledNodes = useMemo(() => {
    if (!highlightMode || highlightedNodes.size === 0) return nodes

    return nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: highlightedNodes.has(node.id) ? 1 : 0.3,
      },
    }))
  }, [nodes, highlightMode, highlightedNodes])

  // Apply styling to edges based on critical path and highlight mode
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const isCritical = showCriticalPath && edge.data?.isCriticalPath
      const isHighlighted =
        !highlightMode ||
        highlightedNodes.size === 0 ||
        (highlightedNodes.has(edge.source) && highlightedNodes.has(edge.target))

      return {
        ...edge,
        animated: isCritical,
        style: {
          stroke: isCritical ? "#ef4444" : isHighlighted ? "#3b82f6" : "#6b7280",
          strokeWidth: isCritical ? 3 : edge.data?.type === "optional" ? 1 : 2,
          opacity: isHighlighted ? 1 : 0.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCritical ? "#ef4444" : isHighlighted ? "#3b82f6" : "#6b7280",
        },
        type: edge.data?.type === "optional" ? "step" : "smoothstep",
      } as Edge
    })
  }, [edges, showCriticalPath, highlightMode, highlightedNodes])

  // Empty state
  if (flowNodes.length === 0) {
    return (
      <div className="h-full w-full bg-background rounded-lg border border-border overflow-hidden flex items-center justify-center">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No flow data yet</p>
          <p className="text-sm">Add steps to your project to visualize the workflow!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-background rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
      >
        <Background className="bg-muted" gap={16} size={1} />

        <Controls className="bg-card border border-border rounded-lg shadow-lg" />

        <MiniMap
          className="bg-card border border-border rounded-lg shadow-lg"
          nodeColor={(node) => {
            if (node.type === "phaseNode") return "#3b82f6"
            const status = node.data?.status
            if (status === "completed") return "#22c55e"
            if (status === "in_progress") return "#3b82f6"
            if (status === "failed") return "#ef4444"
            return "#6b7280"
          }}
        />

        <Panel position="top-left" className="flex gap-2">
          <Button
            variant={highlightMode ? "default" : "outline"}
            size="sm"
            onClick={() => setHighlightMode(!highlightMode)}
            className="bg-card border-border shadow-lg"
          >
            <Target className="w-4 h-4 mr-2" />
            Highlight Mode
          </Button>

          <Button
            variant={showCriticalPath ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCriticalPath(!showCriticalPath)}
            className="bg-card border-border shadow-lg"
          >
            <Zap className="w-4 h-4 mr-2" />
            Critical Path
          </Button>
        </Panel>

        <Panel position="top-right">
          <div className="bg-card border border-border rounded-lg shadow-lg p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-blue-500" />
              <span className="text-muted-foreground">Required</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 border-t border-dashed border-blue-500" />
              <span className="text-muted-foreground">Optional</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-red-500" />
              <span className="text-muted-foreground">Critical Path</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
