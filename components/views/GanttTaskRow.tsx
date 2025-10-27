"use client"

import type React from "react"

import { ChevronRight, ChevronDown, CheckCircle2, Clock, Pause, AlertCircle } from "lucide-react"
import { useState } from "react"
import type { GanttTask } from "@/lib/types"

interface GanttTaskRowProps {
  task: GanttTask
  isPhaseHeader?: boolean
  level?: number
  children?: React.ReactNode
  onTaskClick?: (task: GanttTask) => void
  isSelected?: boolean
}

const statusIcons = {
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500 animate-pulse" />,
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  paused: <Pause className="w-4 h-4 text-yellow-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
}

const agentColors = {
  v0: "bg-blue-500",
  claude: "bg-orange-500",
  gemini: "bg-purple-500",
  gpt: "bg-green-500",
}

export function GanttTaskRow({
  task,
  isPhaseHeader = false,
  level = 0,
  children,
  onTaskClick,
  isSelected = false,
}: GanttTaskRowProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <>
      <div
        className={`flex items-center h-10 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer ${
          isSelected ? "bg-accent" : ""
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onTaskClick?.(task)}
      >
        {isPhaseHeader && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="mr-1"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        )}

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!isPhaseHeader && <div className="ml-5" />}
          {statusIcons[task.status]}
          <span
            className={`text-sm truncate ${isPhaseHeader ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            {task.name}
          </span>
        </div>

        {!isPhaseHeader && (
          <div
            className={`w-6 h-6 rounded-full ${agentColors[task.agent.name]} flex items-center justify-center text-[10px] font-bold text-white mr-2`}
            title={task.agent.name}
          >
            {task.agent.name[0].toUpperCase()}
          </div>
        )}
      </div>

      {isPhaseHeader && isExpanded && children}
    </>
  )
}
