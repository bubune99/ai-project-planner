"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Pause, RotateCw, FileText, ChevronRight, ChevronLeft, Edit } from "lucide-react"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TaskDetailsProps {
  task: Task
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onEdit?: () => void
  onStart?: () => void
  onPause?: () => void
  onRetry?: () => void
  onDocClick?: (docName: string) => void
}

const statusLabels = {
  completed: "Completed",
  in_progress: "In Progress",
  pending: "Pending",
  paused: "Paused",
  failed: "Failed",
}

const statusColors = {
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pending: "bg-muted text-muted-foreground border-border",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
}

const agentColors = {
  v0: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  claude: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  gemini: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  gpt: "bg-green-500/20 text-green-400 border-green-500/30",
}

export function TaskDetails({ task, isCollapsed = false, onToggleCollapse, onEdit, onStart, onPause, onRetry, onDocClick }: TaskDetailsProps) {
  if (isCollapsed) {
    return (
      <div className="w-12 border-l border-border flex items-start justify-center pt-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="hover:bg-accent"
          title="Expand Task Details"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-border flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between bg-card/20">
        <h3 className="text-sm font-semibold text-foreground">Task Details</h3>
        <div className="flex gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit} className="hover:bg-accent h-8 w-8" title="Edit Task">
              <Edit className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hover:bg-accent h-8 w-8"
            title="Collapse Task Details"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">{task.name}</h3>
          <p className="text-sm text-muted-foreground">{task.description}</p>
        </div>

        {/* Status & Agent */}
        <div className="flex items-center gap-3">
          <Badge className={cn("border", statusColors[task.status])}>{statusLabels[task.status]}</Badge>
          <Badge className={cn("border", agentColors[task.agent])}>Assigned: {task.agent}</Badge>
        </div>

        {/* Time Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Estimated Time</p>
            <p className="text-sm font-medium text-foreground">{task.estimatedTime}</p>
          </div>
          {task.actualTime && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Actual Time</p>
              <p className="text-sm font-medium text-foreground">{task.actualTime}</p>
            </div>
          )}
        </div>

        {/* Dependencies */}
        {task.dependencies.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Dependencies</p>
            <div className="flex flex-wrap gap-2">
              {task.dependencies.map((dep) => (
                <Badge key={dep} variant="outline" className="text-xs">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Attached Docs */}
        {task.attachedDocs && task.attachedDocs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Attached Documents</p>
            <div className="space-y-1">
              {task.attachedDocs.map((doc) => (
                <button
                  key={doc}
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  onClick={() => onDocClick?.(doc)}
                >
                  <FileText className="w-4 h-4" />
                  {doc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 border-t border-border space-y-2">
          {task.status === "pending" && (
            <Button className="w-full gap-2" onClick={onStart}>
              <Play className="w-4 h-4" />
              Start Task
            </Button>
          )}
          {task.status === "in_progress" && (
            <Button variant="outline" className="w-full gap-2 bg-transparent" onClick={onPause}>
              <Pause className="w-4 h-4" />
              Pause Task
            </Button>
          )}
          {task.status === "failed" && (
            <Button className="w-full gap-2" onClick={onRetry}>
              <RotateCw className="w-4 h-4" />
              Retry Task
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
