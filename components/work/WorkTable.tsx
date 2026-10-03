"use client"

/*
 * WorkTable — "My Work" as a dense, grouped, bulk-actionable table.
 *
 * Replaces a 364-row card list that measured 40,065px tall (108px per row, no
 * grouping, every row a @hello-pangea/dnd draggable). Modelled on the
 * Users List Datatable pattern (21st.dev, shadcnstore): toolbar, select-all,
 * two-line rows, status pills, per-row actions — built on our own primitives,
 * because that registry entry ships three sibling files it does not include and
 * would overwrite ten of our ui/ components on install.
 *
 * Differences from that pattern, deliberately:
 *   - grouped by project, because 98% of this work belongs to one, and a flat
 *     table of 364 rows from 15 projects is the same pile in a new font;
 *   - per-group "show more" instead of page numbers — paging across groups
 *     splits a project's work over pages and loses its header.
 *
 * Rows come from GET /api/work, which returns each project step once and a
 * todo only when it is not a mirror of a step (lib/work-items.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, MoreHorizontal, Search, CheckCircle2, Undo2, Pencil, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dueText, groupWork, matchesQuery, type WorkItem } from "@/lib/work-items"

type View = "open" | "done"
type StatusKeys = Record<string, { done: string; open: string }>

const ROWS_PER_GROUP = 8

const PRIORITY_PILL: Record<string, string> = {
  urgent: "bg-rose-500/12 text-rose-500",
  high: "bg-amber-500/12 text-amber-500",
  medium: "bg-blue-500/12 text-blue-400",
  low: "bg-muted text-muted-foreground",
}

const STATUS_TEXT: Record<WorkItem["statusKind"], string> = {
  open: "Open",
  active: "In progress",
  done: "Done",
  closed: "Closed",
}

export interface WorkTableProps {
  /** Bumped by the page after a quick-add so the table refetches. */
  refreshKey?: number
  /** Personal todos still edit in the existing modal. */
  onEditTodo?: (todoId: string) => void
}

export function WorkTable({ refreshKey = 0, onEditTodo }: WorkTableProps) {
  const router = useRouter()
  const [view, setView] = useState<View>("open")
  const [items, setItems] = useState<WorkItem[]>([])
  const [statusKeys, setStatusKeys] = useState<StatusKeys>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [priority, setPriority] = useState<string>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const keyOf = (w: WorkItem) => `${w.kind}:${w.id}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/work?view=${view}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`)
      const data = body.data ?? body
      setItems(data.items ?? [])
      setStatusKeys(data.statusKeys ?? {})
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load work")
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const visible = useMemo(
    () =>
      items.filter(
        (w) => matchesQuery(w, query) && (priority === "all" || (w.priority ?? "none") === priority),
      ),
    [items, query, priority],
  )
  const groups = useMemo(() => groupWork(visible), [visible])

  const allVisibleKeys = useMemo(() => visible.map(keyOf), [visible])
  const allSelected = allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected.has(k))
  const someSelected = !allSelected && allVisibleKeys.some((k) => selected.has(k))

  const toggleOne = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allVisibleKeys))
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  /*
    Completion goes through the EXISTING routes rather than a new bulk endpoint.
    The step PATCH owns completed_at, execution_history and the progress
    trigger; a second write path would have to repeat all three and could
    quietly drift from them — which is the class of bug this page exists to
    end. Steps get their own project's done/open key, so a project whose done
    column is called "Shipped" stays consistent with its board.
  */
  const setDone = useCallback(
    async (targets: WorkItem[], done: boolean) => {
      if (!targets.length) return
      setBusy(true)
      const results = await Promise.allSettled(
        targets.map((w) => {
          if (w.kind === "step") {
            const keys = statusKeys[w.projectId ?? ""] ?? { done: "completed", open: "pending" }
            return fetch(`/api/projects/${w.projectId}/steps/${w.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: done ? keys.done : keys.open }),
            }).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
            })
          }
          return fetch(`/api/todos/${w.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: done ? "completed" : "pending" }),
          }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
          })
        }),
      )
      setBusy(false)

      const failed = results.filter((r) => r.status === "rejected").length
      const ok = targets.length - failed
      if (ok) {
        // they leave this view either way — open items move to done and back
        const gone = new Set(
          targets.filter((_, i) => results[i].status === "fulfilled").map(keyOf),
        )
        setItems((prev) => prev.filter((w) => !gone.has(keyOf(w))))
        setSelected((prev) => new Set([...prev].filter((k) => !gone.has(k))))
        toast.success(`${done ? "Completed" : "Reopened"} ${ok} item${ok === 1 ? "" : "s"}`)
      }
      if (failed) toast.error(`${failed} item${failed === 1 ? "" : "s"} could not be updated`)
    },
    [statusKeys],
  )

  const selectedItems = useMemo(
    () => items.filter((w) => selected.has(keyOf(w))),
    [items, selected],
  )

  const openItem = (w: WorkItem) => {
    if (w.kind === "step" && w.projectId) router.push(`/project/${w.projectId}?tab=tasks&step=${w.id}`)
    else onEditTodo?.(w.id)
  }

  return (
    <div className="j-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work…"
            aria-label="Search work"
            className="h-9 pl-8"
          />
        </div>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label="Filter by priority"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">No priority</option>
        </select>

        <div className="inline-flex rounded-md border border-input p-0.5" role="tablist" aria-label="Open or done">
          {(["open", "done"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 rounded px-3 text-sm capitalize transition-colors",
                view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {loading ? "Loading…" : `${visible.length} of ${items.length} · ${groups.length} group${groups.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Bulk bar — the reason for row selection: 20 completions are one action, not 20 */}
      {selectedItems.length > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selectedItems.length} selected</span>
          <Button size="sm" disabled={busy} onClick={() => setDone(selectedItems, view === "open")}>
            {view === "open" ? (
              <>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Complete
              </>
            ) : (
              <>
                <Undo2 className="mr-1 h-4 w-4" /> Reopen
              </>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading work…</div>
      ) : groups.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? view === "open"
              ? "Nothing open. Add something above."
              : "Nothing completed yet."
            : "No work matches these filters."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead>Task</TableHead>
              <TableHead className="w-28">Priority</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28">Due</TableHead>
              <TableHead className="w-10" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.key)
              const showAll = expanded.has(g.key)
              const rows = showAll ? g.items : g.items.slice(0, ROWS_PER_GROUP)
              return (
                <GroupRows
                  key={g.key}
                  label={g.label}
                  count={g.items.length}
                  overdue={g.overdue}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(g.key)}
                  hidden={g.items.length - rows.length}
                  onShowMore={() => setExpanded((p) => new Set(p).add(g.key))}
                >
                  {!isCollapsed &&
                    rows.map((w, i) => (
                      <WorkRow
                        key={keyOf(w)}
                        item={w}
                        striped={i % 2 === 1}
                        selected={selected.has(keyOf(w))}
                        onSelect={() => toggleOne(keyOf(w))}
                        onOpen={() => openItem(w)}
                        onToggleDone={() => setDone([w], view === "open")}
                        doneView={view === "done"}
                      />
                    ))}
                </GroupRows>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function GroupRows({
  label,
  count,
  overdue,
  collapsed,
  onToggle,
  hidden,
  onShowMore,
  children,
}: {
  label: string
  count: number
  overdue: number
  collapsed: boolean
  onToggle: () => void
  hidden: number
  onShowMore: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={6} className="py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex w-full items-center gap-2 text-left text-xs font-medium"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="truncate">{label}</span>
            <span className="tabular-nums text-muted-foreground">{count}</span>
            {overdue > 0 && (
              <span className="rounded-full bg-rose-500/12 px-1.5 text-[10px] font-medium text-rose-500 tabular-nums">
                {overdue} overdue
              </span>
            )}
          </button>
        </TableCell>
      </TableRow>
      {children}
      {!collapsed && hidden > 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="py-1.5">
            <button
              type="button"
              onClick={onShowMore}
              className="pl-8 text-xs text-muted-foreground hover:text-foreground"
            >
              Show {hidden} more
            </button>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function WorkRow({
  item,
  selected,
  onSelect,
  onOpen,
  onToggleDone,
  doneView,
  striped,
}: {
  item: WorkItem
  /** Alternate rows within a group, counted per group so the shading restarts under each header. */
  striped: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onToggleDone: () => void
  doneView: boolean
}) {
  const due = dueText(item.dueDate)
  return (
    <TableRow data-state={selected ? "selected" : undefined} className={striped ? "group bg-white/[0.035]" : "group"}>
      <TableCell className="w-10">
        <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Select ${item.title}`} />
      </TableCell>

      <TableCell className="max-w-0">
        <button type="button" onClick={onOpen} className="block w-full min-w-0 text-left">
          <span
            className={cn(
              "block truncate font-medium text-foreground",
              doneView && "text-muted-foreground line-through",
            )}
          >
            {item.title}
          </span>
          {(item.description || item.kind === "todo") && (
            <span className="block truncate text-xs text-muted-foreground">
              {item.kind === "todo" && item.projectId && (
                <span className="mr-1.5 rounded bg-amber-500/12 px-1 text-[10px] text-amber-500">
                  not on board
                </span>
              )}
              {item.description}
            </span>
          )}
        </button>
      </TableCell>

      <TableCell>
        {item.priority ? (
          <span
            className={cn(
              "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
              PRIORITY_PILL[item.priority] ?? PRIORITY_PILL.low,
            )}
          >
            {item.priority}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">{STATUS_TEXT[item.statusKind]}</TableCell>

      <TableCell
        className={cn(
          "whitespace-nowrap text-xs tabular-nums",
          due.overdue ? "font-medium text-rose-500" : due.soon ? "text-amber-500" : "text-muted-foreground",
        )}
      >
        {due.text || "—"}
      </TableCell>

      <TableCell className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-60 group-hover:opacity-100"
              aria-label={`Actions for ${item.title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOpen}>
              {item.kind === "step" ? (
                <>
                  <ExternalLink className="mr-1" /> Open on board
                </>
              ) : (
                <>
                  <Pencil className="mr-1" /> Edit
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleDone}>
              {doneView ? (
                <>
                  <Undo2 className="mr-1" /> Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1" /> Mark complete
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
