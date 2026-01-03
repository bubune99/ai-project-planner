"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CheckCircle2, Clock, Loader2, Pause, XCircle } from "lucide-react"
import type { FlowNodeData } from "@/lib/types"

const statusIcons = {
  completed: CheckCircle2,
  in_progress: Loader2,
  pending: Clock,
  paused: Pause,
  failed: XCircle,
}

const statusColors = {
  completed: "border-green-500/50 bg-green-500/10",
  in_progress: "border-blue-500/50 bg-blue-500/10",
  pending: "border-yellow-500/50 bg-yellow-500/10",
  paused: "border-gray-500/50 bg-gray-500/10",
  failed: "border-red-500/50 bg-red-500/10",
}

const agentColors: Record<string, string> = {
  v0: "bg-blue-500",
  claude: "bg-orange-500",
  gemini: "bg-purple-500",
  gpt: "bg-green-500",
  human: "bg-gray-500",
}

export const TaskNode = memo(({ data, selected }: NodeProps<FlowNodeData>) => {
  const status = data.status || "pending"
  const StatusIcon = statusIcons[status as keyof typeof statusIcons] || Clock
  const statusColor = statusColors[status as keyof typeof statusColors] || statusColors.pending
  const agentName = data.agent?.name || "human"
  const agentColor = agentColors[agentName] || agentColors.human

  return (
    <div
      className={`relative px-4 py-3 rounded-lg border-2 backdrop-blur-sm shadow-md transition-all min-w-[180px] ${statusColor} ${
        selected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background scale-105" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-blue-500" />

      <div className="flex items-start gap-2">
        <StatusIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-foreground" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{data.label}</p>

          {data.agent && (
            <div className="flex items-center gap-1 mt-1">
              <div className={`w-2 h-2 rounded-full ${agentColor}`} />
              <span className="text-xs text-muted-foreground">{data.agent.name}</span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-blue-500" />
    </div>
  )
})

TaskNode.displayName = "TaskNode"
