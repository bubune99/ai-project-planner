"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowRight, CheckCircle2, Copy, Hash, Link2, Maximize2, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import type { BoardStep } from "@/lib/types"

/** Copies text and says so; a browser that refuses (no permission, not https) is told plainly. */
function copy(text: string, done: string) {
  if (!navigator.clipboard) { toast.error("This browser would not copy it"); return }
  navigator.clipboard.writeText(text).then(() => toast.success(done), () => toast.error("This browser would not copy it"))
}

export interface CardMenuProps {
  step: BoardStep
  isDone: boolean
  onOpen: (step: BoardStep) => void
  onEdit: (step: BoardStep) => void
  onDelete: (step: BoardStep) => void
  onDuplicate: (step: BoardStep) => void
  onToggleComplete: (step: BoardStep) => void
  /**
   * The board's columns, so a card can be moved without dragging it (walk 2026-11-23, "Move a task to start work":
   * the only ways were a drag, or opening the card). Left out, the menu has no Move to.
   */
  columns?: { key: string; label: string }[]
  onMoveTo?: (step: BoardStep, key: string) => void
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
  columns,
  onMoveTo,
}: CardMenuProps) {
  return (
    // data-kanban-no-drag: a pointerdown here must open the menu, not pick the
    // card up. The board checks for this attribute before starting a drag.
    <div data-kanban-no-drag onClick={(e) => e.stopPropagation()}>
      {/* Not modal: a modal menu locked the page and threw the board sideways when it opened (owner, 2026-11-16). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Actions for ${step.title}`}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {/* Real menu items: choosing one closes the menu, the arrow keys reach them, and the copy is confirmed. */}
          <DropdownMenuItem onClick={() => copy(`${window.location.origin}/project/${step.project_id}?tab=tasks&step=${step.id}`, "Link copied")}>
            <Link2 className="mr-1" /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copy(step.id, "ID copied")}>
            <Hash className="mr-1" /> Copy ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onOpen(step)}>
            <Maximize2 className="mr-1" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(step)}>
            <Pencil className="mr-1" /> Edit
          </DropdownMenuItem>
          {columns && onMoveTo && columns.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRight className="mr-1" /> Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {columns.filter((c) => c.key !== step.status).map((c) => (
                  <DropdownMenuItem key={c.key} onClick={() => onMoveTo(step, c.key)}>{c.label}</DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
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
