"use client"

import type { Todo } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit, Trash2, Calendar, Link2, Clock } from "lucide-react"
import { Draggable } from "@hello-pangea/dnd"
import { cn } from "@/lib/utils"
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns"

interface TodoItemProps {
  todo: Todo
  index: number
  onToggle: (id: string) => void
  onEdit: (todo: Todo) => void
  onDelete: (id: string) => void
}

const priorityColors = {
  urgent: "border-l-purple-500",
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
}

const priorityDots = {
  urgent: "bg-purple-500",
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
}

function formatDueDate(dateString: string | null): { text: string; isOverdue: boolean } {
  if (!dateString) return { text: "", isOverdue: false }

  const date = parseISO(dateString)
  const now = new Date()

  if (isToday(date)) {
    return { text: "Today", isOverdue: false }
  }

  if (isTomorrow(date)) {
    return { text: "Tomorrow", isOverdue: false }
  }

  if (isPast(date)) {
    return { text: format(date, "MMM d"), isOverdue: true }
  }

  return { text: format(date, "MMM d"), isOverdue: false }
}

export function TodoItem({ todo, index, onToggle, onEdit, onDelete }: TodoItemProps) {
  const isCompleted = todo.status === "completed"
  const dueInfo = formatDueDate(todo.dueDate)

  return (
    <Draggable draggableId={todo.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "group bg-card border border-border rounded-lg p-3 mb-2 border-l-4 transition-all cursor-grab active:cursor-grabbing",
            priorityColors[todo.priority],
            isCompleted && "opacity-60",
            snapshot.isDragging && "shadow-2xl opacity-90 rotate-1"
          )}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => onToggle(todo.id)}
              className="mt-0.5 h-5 w-5"
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title */}
              <h4
                className={cn(
                  "font-medium text-sm text-foreground leading-tight",
                  isCompleted && "line-through text-muted-foreground"
                )}
              >
                {todo.title}
              </h4>

              {/* Description (if present) */}
              {todo.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {todo.description}
                </p>
              )}

              {/* Meta info row */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {/* Priority badge */}
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <div className={cn("w-2 h-2 rounded-full", priorityDots[todo.priority])} />
                  {todo.priority}
                </Badge>

                {/* Due date */}
                {dueInfo.text && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs flex items-center gap-1",
                      dueInfo.isOverdue && !isCompleted && "border-red-500 text-red-500"
                    )}
                  >
                    <Calendar className="w-3 h-3" />
                    {dueInfo.text}
                  </Badge>
                )}

                {/* Project link */}
                {todo.project && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    {todo.project.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* Action buttons (shown on hover) */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(todo)
                }}
                className="h-7 w-7 p-0"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(todo.id)
                }}
                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
