"use client"

import type { BoardStep } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Flag,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react"
import { Draggable } from "@hello-pangea/dnd"
import { format, isPast, isToday, isTomorrow } from "date-fns"
import { AGENT_AVATAR, PRIORITY_BORDER, normalizeChecklist } from "./kanban-config"

interface KanbanCardProps {
  step: BoardStep
  index: number
  subtasks: BoardStep[]
  onOpen: (step: BoardStep) => void
  onEdit: (step: BoardStep) => void
  onDelete: (step: BoardStep) => void
  onDuplicate: (step: BoardStep) => void
  onToggleComplete: (step: BoardStep) => void
}

function dueLabel(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return "Today"
  if (isTomorrow(date)) return "Tomorrow"
  return format(date, "MMM d")
}

export function KanbanCard({
  step,
  index,
  subtasks,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleComplete,
}: KanbanCardProps) {
  const doneSubtasks = subtasks.filter((s) => s.status === "completed").length
  const checklist = normalizeChecklist(step.tasks)
  const doneChecklist = checklist.filter((c) => c.done).length
  const isDone = step.status === "completed"
  const overdue = !!step.end_date && !isDone && isPast(new Date(step.end_date)) && !isToday(new Date(step.end_date))
  const depCount = Array.isArray(step.dependencies) ? step.dependencies.length : 0
  const estimate = Number(step.estimated_hours ?? 0)

  return (
    <Draggable draggableId={step.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(step)}
          className={`group bg-card border border-border rounded-lg p-3 mb-2 border-l-4 ${
            step.priority ? PRIORITY_BORDER[step.priority] : "border-l-transparent"
          } hover:shadow-lg hover:border-border transition-all cursor-pointer
          ${snapshot.isDragging ? "shadow-2xl opacity-90 rotate-1" : ""}
          ${isDone ? "opacity-70" : ""}`}
        >
          {/* Title row + hover actions */}
          <div className="flex items-start gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleComplete(step)
              }}
              title={isDone ? "Reopen" : "Mark complete"}
              className={`mt-0.5 shrink-0 transition-colors ${
                isDone ? "text-green-500" : "text-muted-foreground/40 hover:text-green-500"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
            <h4
              className={`flex-1 font-medium text-sm leading-tight ${
                isDone ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {step.title}
            </h4>
            <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mt-0.5">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(step)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(step)}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleComplete(step)}>
                    {isDone ? (
                      <><Undo2 className="w-3.5 h-3.5 mr-2" /> Reopen</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Mark complete</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(step)} className="text-red-500 focus:text-red-500">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Description preview */}
          {step.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.description}</p>
          )}

          {/* Chips */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2 empty:mt-0">
            {step.priority && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                <Flag
                  className={`w-2.5 h-2.5 ${
                    step.priority === "high"
                      ? "text-red-500"
                      : step.priority === "medium"
                        ? "text-yellow-500"
                        : "text-green-500"
                  }`}
                />
                {step.priority}
              </Badge>
            )}
            {step.end_date && (
              <Badge
                variant="outline"
                className={`text-[10px] h-5 px-1.5 gap-1 ${overdue ? "border-red-500/50 text-red-500" : ""}`}
              >
                <Calendar className="w-2.5 h-2.5" />
                {dueLabel(step.end_date)}
              </Badge>
            )}
            {estimate > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                <Clock className="w-2.5 h-2.5" />
                {estimate}h
              </Badge>
            )}
            {subtasks.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                ☑ {doneSubtasks}/{subtasks.length}
              </Badge>
            )}
            {checklist.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                ✓ {doneChecklist}/{checklist.length}
              </Badge>
            )}
            {depCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1">
                <Link2 className="w-2.5 h-2.5" />
                {depCount}
              </Badge>
            )}
          </div>

          {/* Progress bar */}
          {step.progress > 0 && step.progress < 100 && (
            <div className="mt-2 h-1 rounded-full bg-accent overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${step.progress}%` }} />
            </div>
          )}

          {/* Footer: phase + agent */}
          {(step.phase || step.assigned_agent) && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted-foreground truncate">{step.phase}</span>
              {step.assigned_agent && (
                <div
                  title={step.assigned_agent}
                  className={`w-5 h-5 rounded-full ${AGENT_AVATAR[step.assigned_agent]} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                >
                  {step.assigned_agent[0].toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
