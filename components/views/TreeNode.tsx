"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, Play, Pause, RotateCw, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Phase, Task } from "@/lib/types"

interface TreeNodeProps {
  phase: Phase
  level: number
  selectedTaskId?: string
  onTaskSelect: (task: Task) => void
  onEdit?: (task: Task) => void
}

const statusIcons = {
  completed: "✅",
  in_progress: "🔄",
  pending: "⏳",
  paused: "⏸️",
  failed: "❌",
}

const statusColors = {
  completed: "text-green-500",
  in_progress: "text-blue-500",
  pending: "text-muted-foreground",
  paused: "text-yellow-500",
  failed: "text-red-500",
}

const agentColors = {
  v0: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  claude: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  gemini: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  gpt: "bg-green-500/20 text-green-400 border-green-500/30",
}

export function TreeNode({ phase, level, selectedTaskId, onTaskSelect, onEdit }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2)
  const hasChildren = (phase.subtasks && phase.subtasks.length > 0) || phase.tasks.length > 0
  const indent = level * 24

  const getActionButton = (task: Task, status: Task["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit?.(task)}>
            <Edit className="w-3 h-3" />
            Edit
          </Button>
        )
      case "in_progress":
        return (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Pause className="w-3 h-3" />
              Pause
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit?.(task)}>
              <Edit className="w-3 h-3" />
            </Button>
          </>
        )
      case "pending":
        return (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Play className="w-3 h-3" />
              Start
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit?.(task)}>
              <Edit className="w-3 h-3" />
            </Button>
          </>
        )
      case "failed":
        return (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <RotateCw className="w-3 h-3" />
              Retry
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit?.(task)}>
              <Edit className="w-3 h-3" />
            </Button>
          </>
        )
      default:
        return (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit?.(task)}>
            <Edit className="w-3 h-3" />
          </Button>
        )
    }
  }

  return (
    <div>
      {/* Phase/Subtask Header */}
      <div
        className={cn(
          "group flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-md transition-colors cursor-pointer relative",
          phase.status === "in_progress" && "bg-accent/30",
        )}
        style={{ paddingLeft: `${indent + 12}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {/* Connecting Line */}
        {level > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" style={{ left: `${indent - 12}px` }} />
        )}

        {/* Expand/Collapse Icon */}
        {hasChildren ? (
          <div className="w-4 h-4 flex items-center justify-center text-muted-foreground">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        ) : (
          <div className="w-4 h-4" />
        )}

        {/* Phase Icon */}
        <span className="text-base">📦</span>

        {/* Phase Name */}
        <span className="font-medium text-foreground flex-1">{phase.name}</span>

        {/* Progress Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-accent rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  phase.progress === 100 ? "bg-green-500" : phase.progress > 0 ? "bg-blue-500" : "bg-muted",
                )}
                style={{ width: `${phase.progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium min-w-[40px]">{phase.progress}%</span>
          </div>

          {/* Start All Button (visible on hover for pending phases) */}
          {phase.status === "pending" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <Play className="w-3 h-3" />
              Start All
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="space-y-0.5">
          {/* Render subtasks (nested phases) */}
          {phase.subtasks?.map((subtask) => (
            <TreeNode
              key={subtask.id}
              phase={subtask}
              level={level + 1}
              selectedTaskId={selectedTaskId}
              onTaskSelect={onTaskSelect}
              onEdit={onEdit}
            />
          ))}

          {/* Render tasks */}
          {phase.tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "group flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-md transition-all cursor-pointer relative",
                selectedTaskId === task.id && "bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/15",
              )}
              style={{ paddingLeft: `${(level + 1) * 24 + 12}px` }}
              onClick={() => onTaskSelect(task)}
            >
              {/* Connecting Line */}
              <div
                className="absolute left-0 top-0 bottom-0 w-px bg-border"
                style={{ left: `${(level + 1) * 24 - 12}px` }}
              />

              {/* Status Icon */}
              <span
                className={cn("text-base", statusColors[task.status], task.status === "in_progress" && "animate-pulse")}
              >
                {statusIcons[task.status]}
              </span>

              {/* Task Name */}
              <span className="text-sm text-foreground flex-1">{task.name}</span>

              {/* Agent Badge */}
              <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", agentColors[task.agent])}>
                {task.agent}
              </span>

              {/* Time Badge */}
              {task.actualTime && <span className="text-xs text-muted-foreground">{task.actualTime}</span>}
              {!task.actualTime && task.estimatedTime && (
                <span className="text-xs text-muted-foreground">~{task.estimatedTime}</span>
              )}

              {/* Action Button (visible on hover) */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {getActionButton(task, task.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
