"use client"

import type { KanbanTask } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Edit, Trash2, FileText, Clock } from "lucide-react"
import { Draggable } from "@hello-pangea/dnd"

interface KanbanCardProps {
  task: KanbanTask
  index: number
  onView: (task: KanbanTask) => void
  onEdit: (task: KanbanTask) => void
  onDelete: (taskId: string) => void
}

const agentColors = {
  v0: "bg-blue-500",
  claude: "bg-purple-500",
  gemini: "bg-green-500",
  gpt: "bg-orange-500",
}

const priorityColors = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
}

const priorityDots = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
}

export function KanbanCard({ task, index, onView, onEdit, onDelete }: KanbanCardProps) {
  const completedSubtasks = task.subtasks?.filter((st) => st.done).length || 0
  const totalSubtasks = task.subtasks?.length || 0

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group bg-card border border-border rounded-lg p-3 mb-3 border-l-4 ${priorityColors[task.priority]} 
            hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing
            ${snapshot.isDragging ? "shadow-2xl opacity-90 rotate-2" : ""}`}
        >
          <div className="space-y-2">
            {/* Title */}
            <h4 className="font-medium text-sm text-foreground leading-tight">{task.title}</h4>

            {/* Agent Badge */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full ${agentColors[task.agent]} flex items-center justify-center text-white text-xs font-bold`}
              >
                {task.agent[0].toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground">{task.agent}</span>
            </div>

            {/* Priority & Estimate */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${priorityDots[task.priority]}`} />
                {task.priority}
              </Badge>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.estimate}
              </Badge>
            </div>

            {/* Phase & Docs */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{task.phase}</span>
              {task.attachedDocs > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  {task.attachedDocs} docs
                </span>
              )}
            </div>

            {/* Subtasks Progress */}
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span>
                  {completedSubtasks} of {totalSubtasks}
                </span>
                <span>☑</span>
              </div>
            )}

            {/* Action Buttons (shown on hover) */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="ghost" onClick={() => onView(task)} className="h-7 px-2 text-xs">
                <Eye className="w-3 h-3 mr-1" />
                View
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(task)} className="h-7 px-2 text-xs">
                <Edit className="w-3 h-3 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(task.id)}
                className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
