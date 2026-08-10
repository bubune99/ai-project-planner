"use client"

import { useState } from "react"
import type { BoardStep } from "@/lib/types"
import type { ColumnDef } from "./kanban-config"
import { KanbanCard } from "./KanbanCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Droppable } from "@hello-pangea/dnd"
import { ChevronsLeft, ChevronsRight, Loader2, Plus } from "lucide-react"

interface KanbanColumnProps {
  column: ColumnDef
  steps: BoardStep[]
  subtasksOf: (stepId: string) => BoardStep[]
  collapsed: boolean
  onToggleCollapse: (key: string) => void
  onQuickAdd: (columnKey: string, title: string) => Promise<void>
  onOpen: (step: BoardStep) => void
  onEdit: (step: BoardStep) => void
  onDelete: (step: BoardStep) => void
  onDuplicate: (step: BoardStep) => void
  onToggleComplete: (step: BoardStep) => void
}

export function KanbanColumn({
  column,
  steps,
  subtasksOf,
  collapsed,
  onToggleCollapse,
  onQuickAdd,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleComplete,
}: KanbanColumnProps) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [saving, setSaving] = useState(false)

  const submitQuickAdd = async () => {
    const title = newTitle.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      await onQuickAdd(column.key, title)
      setNewTitle("")
    } finally {
      setSaving(false)
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => onToggleCollapse(column.key)}
        className="shrink-0 w-9 bg-accent/20 rounded-lg border border-border/50 flex flex-col items-center gap-2 py-3 hover:bg-accent/40 transition-colors"
        title={`Expand ${column.label}`}
      >
        <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={`w-2 h-2 rounded-full ${column.dotClass}`} />
        <span
          className="text-xs font-semibold text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          {column.label} · {steps.length}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col shrink-0 w-[290px] max-h-full bg-accent/20 rounded-lg border border-border/50">
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${column.pillClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${column.dotClass}`} />
          {column.label}
        </span>
        <span className="text-xs text-muted-foreground">{steps.length}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => setAdding(true)}
          title="Add task"
          disabled={column.isDropDisabled}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => onToggleCollapse(column.key)}
          title="Collapse"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Droppable card list */}
      <Droppable droppableId={column.key} isDropDisabled={!!column.isDropDisabled}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto px-2 pb-2 min-h-[120px] rounded-lg transition-colors ${
              snapshot.isDraggingOver ? "bg-blue-500/10 outline-dashed outline-2 outline-blue-500/60" : ""
            }`}
          >
            {steps.map((step, index) => (
              <KanbanCard
                key={step.id}
                step={step}
                index={index}
                subtasks={subtasksOf(step.id)}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onToggleComplete={onToggleComplete}
              />
            ))}
            {provided.placeholder}
            {steps.length === 0 && !snapshot.isDraggingOver && !adding && (
              <div className="flex items-center justify-center h-20 text-muted-foreground/60 text-xs">
                No tasks
              </div>
            )}
          </div>
        )}
      </Droppable>

      {/* Quick add */}
      <div className="px-2 pb-2">
        {adding ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newTitle}
              placeholder="Task title, Enter to save"
              className="h-8 text-sm"
              disabled={saving}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitQuickAdd()
                if (e.key === "Escape") {
                  setAdding(false)
                  setNewTitle("")
                }
              }}
              onBlur={() => {
                if (!newTitle.trim()) setAdding(false)
              }}
            />
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          </div>
        ) : (
          !column.isDropDisabled && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 text-muted-foreground text-xs"
              onClick={() => setAdding(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add task
            </Button>
          )
        )}
      </div>
    </div>
  )
}
