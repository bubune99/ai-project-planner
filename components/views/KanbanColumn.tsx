"use client"

import type { KanbanTask } from "@/lib/types"
import { KanbanCard } from "./KanbanCard"
import { Badge } from "@/components/ui/badge"
import { Droppable } from "@hello-pangea/dnd"

interface KanbanColumnProps {
  title: string
  icon: string
  status: "backlog" | "in_progress" | "review" | "complete"
  tasks: KanbanTask[]
  onView: (task: KanbanTask) => void
  onEdit: (task: KanbanTask) => void
  onDelete: (taskId: string) => void
}

export function KanbanColumn({ title, icon, status, tasks, onView, onEdit, onDelete }: KanbanColumnProps) {
  return (
    <div className="flex-1 min-w-[280px] bg-accent/20 rounded-lg p-4 border border-border/50">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </h3>
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </div>

      {/* Droppable Area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-[200px] transition-colors rounded-lg ${
              snapshot.isDraggingOver ? "bg-blue-500/10 border-2 border-dashed border-blue-500" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <KanbanCard key={task.id} task={task} index={index} onView={onView} onEdit={onEdit} onDelete={onDelete} />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No tasks</div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
