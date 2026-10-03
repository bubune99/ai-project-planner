"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle2, Copy, Maximize2, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react"
import type { BoardStep } from "@/lib/types"

export interface CardMenuProps {
  step: BoardStep
  isDone: boolean
  onOpen: (step: BoardStep) => void
  onEdit: (step: BoardStep) => void
  onDelete: (step: BoardStep) => void
  onDuplicate: (step: BoardStep) => void
  onToggleComplete: (step: BoardStep) => void
}

/**
 * The per-card actions, lifted verbatim out of KanbanCard so the new board can
 * keep them. Card actions are the one thing the adopted board had none of.
 *
 * `Button` must stay a forwardRef component for DropdownMenuTrigger asChild to
 * position this against the trigger — when it was a plain function component
 * under React 18 the ref never arrived and the menu rendered at 0,-362,
 * off-screen. See components/ui/button.tsx.
 */
export function CardMenu({
  step,
  isDone,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleComplete,
}: CardMenuProps) {
  return (
    // data-kanban-no-drag: a pointerdown here must open the menu, not pick the
    // card up. The board checks for this attribute before starting a drag.
    <div data-kanban-no-drag onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Actions for ${step.title}`}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {/* Segmented quick-actions header, as ClickUp does: clipboard
              actions sit above the list instead of padding it out. */}
          <div className="flex gap-1 p-1">
            <button
              className="flex-1 rounded-sm border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?step=${step.id}`
                navigator.clipboard?.writeText(url)
              }}
            >
              Copy link
            </button>
            <button
              className="flex-1 rounded-sm border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => navigator.clipboard?.writeText(step.id)}
            >
              Copy ID
            </button>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onOpen(step)}>
            <Maximize2 className="mr-1" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(step)}>
            <Pencil className="mr-1" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDuplicate(step)}>
            <Copy className="mr-1" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleComplete(step)}>
            {isDone ? (
              <>
                <Undo2 className="mr-1" /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1" /> Mark complete
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(step)}>
            <Trash2 className="mr-1" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
