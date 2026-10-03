"use client"

import { useState } from "react"
import type { BoardStep } from "@/lib/types"
import { STATUS_PALETTE, type ColumnDef, type ProjectStatus, type StatusKind } from "./kanban-config"
import { KanbanCard } from "./KanbanCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Droppable } from "@hello-pangea/dnd"
import { ChevronsLeft, ChevronsRight, CircleDot, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

interface KanbanColumnProps {
  column: ColumnDef
  steps: BoardStep[]
  subtasksOf: (stepId: string) => BoardStep[]
  statusMap: Record<string, ProjectStatus>
  expandSubtasks: boolean
  collapsed: boolean
  /** Column management callbacks — present only when grouping by status */
  onEditColumn?: (key: string, patch: { label?: string; color?: string; kind?: StatusKind }) => void
  onDeleteColumn?: (key: string) => void
  /** Reorder this column. dir -1 = left, +1 = right. Rename and delete already
   *  existed in this menu; moving did not, which is the gap the owner hit. */
  onMoveColumn?: (key: string, dir: -1 | 1) => void
  isFirstColumn?: boolean
  isLastColumn?: boolean
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
  statusMap,
  expandSubtasks,
  collapsed,
  onEditColumn,
  onDeleteColumn,
  onMoveColumn,
  isFirstColumn,
  isLastColumn,
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
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.label)

  const kind = statusMap[column.key]?.kind

  /** One menu, two triggers: the column title and the ... button. They were
   *  diverging — the title offered a subset — which is its own kind of
   *  confusion. */
  const columnMenu = (align: "start" | "end") => {
    // Narrowing from the `onEditColumn &&` guard at the call site does not reach
    // into this closure, so re-establish it here.
    if (!onEditColumn) return null
    const editColumn = onEditColumn
    const moveColumn = onMoveColumn
    return (
<DropdownMenuContent align={align} className="w-48">
      {/* Grouped the way ClickUp groups a task menu: actions first,
          configuration behind submenus, destructive isolated last.
          Previously this was one flat stack where 7 colour swatches and
          4 radios took up more room than every action combined. */}
      <DropdownMenuItem
        onClick={() => {
          setRenameValue(column.label)
          setRenaming(true)
        }}
      >
        <Pencil className="mr-1" /> Rename
      </DropdownMenuItem>

      {moveColumn && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isFirstColumn} onClick={() => moveColumn(column.key, -1)}>
            <ChevronsLeft className="mr-1" /> Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLastColumn} onClick={() => moveColumn(column.key, 1)}>
            <ChevronsRight className="mr-1" /> Move right
          </DropdownMenuItem>
        </>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span
            className="w-3 h-3 rounded-full border border-border mr-1 shrink-0"
            style={column.colorHex ? { backgroundColor: column.colorHex } : undefined}
          />
          Colour
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="p-2">
          <div className="flex flex-wrap gap-1.5 w-[132px]">
            {STATUS_PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`Set column colour ${c}`}
                onClick={() => editColumn(column.key, { color: c })}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                  column.colorHex === c ? "border-foreground" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <CircleDot className="mr-1" /> Counts as
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={kind}
            onValueChange={(v) => editColumn(column.key, { kind: v as StatusKind })}
          >
            <DropdownMenuRadioItem value="open">Not started</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="done">Done</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="closed">Closed (not done)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {onDeleteColumn && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDeleteColumn(column.key)}>
            <Trash2 className="mr-1" /> Delete column
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
    )
  }


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

  const submitRename = () => {
    const label = renameValue.trim()
    setRenaming(false)
    if (label && label !== column.label) onEditColumn?.(column.key, { label })
  }

  if (collapsed) {
    return (
      <button
        onClick={() => onToggleCollapse(column.key)}
        className="shrink-0 w-9 bg-accent/20 rounded-lg border border-border/50 flex flex-col items-center gap-2 py-3 hover:bg-accent/40 transition-colors"
        title={`Expand ${column.label}`}
      >
        <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span
          className={`w-2 h-2 rounded-full ${column.dotClass}`}
          style={column.colorHex ? { backgroundColor: column.colorHex } : undefined}
        />
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
    <div className="flex flex-col shrink-0 w-[248px] min-h-0 max-h-full bg-accent/20 rounded-lg border border-border/50">
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {renaming ? (
          <Input
            autoFocus
            aria-label={`Rename the ${column.label} column`}
            value={renameValue}
            className="h-6 text-xs font-semibold"
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename()
              if (e.key === "Escape") setRenaming(false)
            }}
            onBlur={submitRename}
          />
        ) : onEditColumn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Column options"
                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:brightness-125 ${column.pillClass}`}
                style={
                  column.colorHex
                    ? { backgroundColor: column.colorHex + "26", color: column.colorHex }
                    : undefined
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${column.dotClass}`}
                  style={column.colorHex ? { backgroundColor: column.colorHex } : undefined}
                />
                {column.label}
              </button>
            </DropdownMenuTrigger>
            {columnMenu("start")}
          </DropdownMenu>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${column.pillClass}`}
            style={
              column.colorHex
                ? { backgroundColor: column.colorHex + "26", color: column.colorHex }
                : undefined
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${column.dotClass}`}
              style={column.colorHex ? { backgroundColor: column.colorHex } : undefined}
            />
            {column.label}
          </span>
        )}
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
        {onEditColumn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Column options">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {columnMenu("end")}
          </DropdownMenu>
        )}
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
            className={`px-2 pb-2 min-h-[44px] rounded-lg transition-colors ${
              snapshot.isDraggingOver ? "bg-blue-500/10 outline-dashed outline-2 outline-blue-500/60" : ""
            }`}
          >
            {steps.map((step, index) => (
              <KanbanCard
                key={step.id}
                step={step}
                index={index}
                subtasks={subtasksOf(step.id)}
                statusMap={statusMap}
                expandSubtasks={expandSubtasks}
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
              aria-label={`New task in ${column.label}`}
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
