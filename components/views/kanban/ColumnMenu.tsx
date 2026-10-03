"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronsLeft, ChevronsRight, CircleDot, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { STATUS_PALETTE, type ColumnDef, type StatusKind } from "../kanban-config"

export interface ColumnMenuProps {
  column: ColumnDef
  kind: StatusKind
  isFirstColumn?: boolean
  isLastColumn?: boolean
  /** Column management — supplied only when grouping by status. */
  onEditColumn?: (key: string, patch: { label?: string; color?: string; kind?: StatusKind }) => void
  onMoveColumn?: (key: string, dir: -1 | 1) => void
  onDeleteColumn?: (key: string) => void
}

/**
 * The column actions, lifted out of KanbanColumn so the adopted board can keep
 * them — its own header dots were inert.
 *
 * Rename moved into a dialog. In the old board the header owned an inline
 * input; the new board owns its header and hands callers only a trailing slot,
 * so the rename has to carry its own surface rather than mutate the header.
 */
export function ColumnMenu({
  column,
  kind,
  isFirstColumn,
  isLastColumn,
  onEditColumn,
  onMoveColumn,
  onDeleteColumn,
}: ColumnMenuProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.label)

  // Narrowing from an `onEditColumn &&` guard at the call site does not reach
  // into this component, so re-establish it here.
  if (!onEditColumn) return null
  const editColumn = onEditColumn

  const commitRename = () => {
    const next = renameValue.trim()
    if (next && next !== column.label) editColumn(column.key, { label: next })
    setRenaming(false)
  }

  return (
    <div data-kanban-no-drag>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            aria-label={`More options for ${column.label}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>

        {/* Grouped the way ClickUp groups a task menu: actions first,
            configuration behind submenus, destructive isolated last. */}
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(column.label)
              setRenaming(true)
            }}
          >
            <Pencil className="mr-1" /> Rename
          </DropdownMenuItem>

          {onMoveColumn && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isFirstColumn} onClick={() => onMoveColumn(column.key, -1)}>
                <ChevronsLeft className="mr-1" /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLastColumn} onClick={() => onMoveColumn(column.key, 1)}>
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
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Column name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") setRenaming(false)
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
