"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { FlowNodeData } from "@/lib/types"

const phaseColors = {
  1: "from-green-500/20 to-green-600/20 border-green-500/50",
  2: "from-blue-500/20 to-blue-600/20 border-blue-500/50",
  3: "from-purple-500/20 to-purple-600/20 border-purple-500/50",
  4: "from-orange-500/20 to-orange-600/20 border-orange-500/50",
}

export const PhaseNode = memo(({ data, selected }: NodeProps<FlowNodeData>) => {
  const colorClass = phaseColors[data.phase as keyof typeof phaseColors] || phaseColors[1]

  return (
    <div
      className={`relative px-6 py-4 rounded-xl border-2 bg-gradient-to-br backdrop-blur-sm shadow-lg transition-all ${colorClass} ${
        selected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background scale-105" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-blue-500" />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{data.label}</h3>

        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-muted-foreground/20"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 16}`}
                strokeDashoffset={`${2 * Math.PI * 16 * (1 - (data.progress || 0) / 100)}`}
                className="text-foreground transition-all"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-foreground">{data.progress}%</span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">{data.taskCount} tasks</div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-blue-500" />
    </div>
  )
})

PhaseNode.displayName = "PhaseNode"
