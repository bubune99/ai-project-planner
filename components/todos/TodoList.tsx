"use client"

import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd"
import { TodoItem } from "./TodoItem"
import type { Todo } from "@/lib/types"
import { Inbox } from "lucide-react"

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string) => void
  onEdit: (todo: Todo) => void
  onDelete: (id: string) => void
  onReorder: (todoIds: string[]) => void
  emptyMessage?: string
}

export function TodoList({
  todos,
  onToggle,
  onEdit,
  onDelete,
  onReorder,
  emptyMessage = "No todos yet. Add one above!"
}: TodoListProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const items = Array.from(todos)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    // Call reorder with new order
    onReorder(items.map(item => item.id))
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="todo-list">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-0 ${snapshot.isDraggingOver ? "bg-muted/30 rounded-lg" : ""}`}
          >
            {todos.map((todo, index) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                index={index}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
