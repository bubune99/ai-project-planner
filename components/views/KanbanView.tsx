"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { BoardStep } from "@/lib/types"
import { KanbanToolbar, EMPTY_FILTERS, type BoardFilters } from "./KanbanToolbar"
import { TaskDetailModal } from "./TaskDetailModal"
import { StepFormModal } from "@/components/steps/StepFormModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KanbanBoard, type KanbanTask } from "./kanban/KanbanBoard"
import { toKanbanColumns } from "./kanban/adapt"
import { ColumnMenu } from "./kanban/ColumnMenu"
import { CardMenu } from "./kanban/CardMenu"
import { CardActions } from "./kanban/CardActions"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import {
  columnsFor,
  doneKeyOf,
  groupKeyOf,
  openKeyOf,
  patchForMove,
  sortSteps,
  statusMapOf,
  DEFAULT_STATUSES,
  STATUS_PALETTE,
  type GroupBy,
  type ProjectStatus,
  type SortBy,
  type StatusKind,
  UNTITLED_TASK,
  leftUntouched,
} from "./kanban-config"

interface KanbanViewProps {
  projectId: string
  onTaskSelect?: (step: BoardStep | null) => void
  onRefresh?: () => void
  /**
   * Open this step's detail as soon as it is loaded. Set from ?step= so a link
   * from My Work ("Open on board") lands on the task itself rather than on a
   * board of 80 cards you then have to search.
   */
  initialStepId?: string | null
}

interface BoardPrefs {
  groupBy: GroupBy
  sortBy: SortBy
  showCompleted: boolean
  expandSubtasks: boolean
  collapsed: string[]
}

const DEFAULT_PREFS: BoardPrefs = {
  groupBy: "status",
  sortBy: "manual",
  showCompleted: true,
  expandSubtasks: false,
  collapsed: [],
}

function loadPrefs(projectId: string): BoardPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(`kanban-prefs:${projectId}`)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/** The projectId that turns the board into every project's board at once (owner, 2026-11-16: "Macro task board to micro task board"). */
export const ALL_PROJECTS = "all"

export function KanbanView({ projectId, onTaskSelect, onRefresh, initialStepId }: KanbanViewProps) {
  const all = projectId === ALL_PROJECTS
  const [steps, setSteps] = useState<BoardStep[]>([])
  const [customStatuses, setCustomStatuses] = useState<ProjectStatus[]>([])
  const [fetching, setFetching] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS)
  const [prefs, setPrefs] = useState<BoardPrefs>(() => loadPrefs(projectId))
  const [detailStepId, setDetailStepId] = useState<string | null>(null)
  /** The card "Add task" just made, as it was made: closed untouched, it is not kept. */
  const draftRef = useRef<BoardStep | null>(null)

  // Open the linked step once — only after steps have loaded, and only for an
  // id that actually belongs to this project, so a stale link opens nothing
  // rather than an empty modal.
  const openedInitial = useRef<string | null>(null)
  useEffect(() => {
    if (!initialStepId || openedInitial.current === initialStepId) return
    if (!steps.some((st) => st.id === initialStepId)) return
    openedInitial.current = initialStepId
    setDetailStepId(initialStepId)
  }, [initialStepId, steps])
  const [formStep, setFormStep] = useState<BoardStep | null>(null)
  const [showStepForm, setShowStepForm] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupLabel, setNewGroupLabel] = useState("")

  const usingDefaults = customStatuses.length === 0
  const statuses = usingDefaults ? DEFAULT_STATUSES : customStatuses
  const statusMap = useMemo(() => statusMapOf(statuses), [statuses])

  const savePrefs = useCallback(
    (next: Partial<BoardPrefs>) => {
      setPrefs((prev) => {
        const merged = { ...prev, ...next }
        try {
          window.localStorage.setItem(`kanban-prefs:${projectId}`, JSON.stringify(merged))
        } catch {}
        return merged
      })
    },
    [projectId]
  )

  const refetchStatuses = useCallback(async (): Promise<ProjectStatus[]> => {
    try {
      // The all-projects board uses the standard columns; a project's own columns stay on its own board.
      if (all) { setCustomStatuses([]); return [] }
      const res = await fetch(`/api/projects/${projectId}/statuses`)
      const data = await res.json()
      const rows = Array.isArray(data.statuses) ? data.statuses : []
      setCustomStatuses(rows)
      return rows
    } catch {
      return []
    }
  }, [projectId])

  const refetch = useCallback(async () => {
    try {
      const [stepsRes] = await Promise.all([
        fetch(all ? "/api/steps" : `/api/projects/${projectId}/steps`),
        refetchStatuses(),
      ])
      const data = await stepsRes.json()
      if (Array.isArray(data.steps)) setSteps(data.steps)
    } catch (err) {
      console.error("Failed to fetch steps:", err)
      toast.error("Failed to load board")
    } finally {
      setFetching(false)
    }
  }, [projectId, refetchStatuses])

  useEffect(() => {
    refetch()
  }, [refetch])

  const parents = useMemo(() => steps.filter((s) => !s.parent_task_id), [steps])
  // Each card is saved through its own project (on the all-projects board the cards come from many).
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const stepUrl = useCallback(
    (stepId: string) => `/api/projects/${all ? stepsRef.current.find((s) => s.id === stepId)?.project_id ?? projectId : projectId}/steps/${stepId}`,
    [all, projectId],
  )
  const projectsOnBoard = useMemo(() => {
    if (!all) return undefined
    const m = new Map<string, { id: string; name: string; count: number }>()
    for (const s of steps) {
      if (s.parent_task_id) continue
      const name = (s as BoardStep & { project_name?: string }).project_name ?? "Project"
      const cur = m.get(s.project_id) ?? { id: s.project_id, name, count: 0 }
      m.set(s.project_id, { ...cur, count: cur.count + 1 })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [all, steps])
  const subtasksOf = useCallback((stepId: string) => steps.filter((s) => s.parent_task_id === stepId), [steps])
  const phases = useMemo(
    () => Array.from(new Set(steps.map((s) => s.phase).filter((p): p is string => !!p))),
    [steps]
  )
  const allTags = useMemo(
    () => Array.from(new Set(steps.flatMap((s) => (Array.isArray(s.tags) ? s.tags : [])))).sort(),
    [steps]
  )

  /**
   * Start: the card goes into Up next (the ready line) and is sent to its project's agents; it moves to In Progress
   * only when an agent takes it (owner, inbox be28f3e9). Returns what to tell him.
   */
  const startStep = useCallback(
    async (stepId: string): Promise<string> => {
      try {
        const res = await fetch(`${stepUrl(stepId)}/start`, { method: "POST" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setSteps((prev) => prev.map((s) => (s.id === stepId ? ({ ...s, status: data.column || "pending" } as BoardStep) : s)))
        toast.success(data.message || "In line for an agent")
        onRefresh?.()
        refetch()
        return data.message || "In line for an agent"
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not start this card"
        toast.error(msg)
        return msg
      }
    },
    [stepUrl, refetch, onRefresh]
  )

  /** Optimistically apply a patch locally, then persist; revert via refetch on failure. */
  const patchStep = useCallback(
    async (stepId: string, patch: Record<string, unknown>) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? ({ ...s, ...patch } as BoardStep) : s))
      )
      try {
        const res = await fetch(stepUrl(stepId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const { step } = await res.json()
        if (step) setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, ...step } : s)))
        onRefresh?.()
      } catch (err) {
        console.error("Failed to update step:", err)
        toast.error(err instanceof Error ? err.message : "Failed to update step")
        refetch()
      }
    },
    [projectId, refetch, onRefresh]
  )

  const createStep = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${projectId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const { step } = await res.json()
      if (step) setSteps((prev) => [...prev, { ...step, dependencies: step.dependencies ?? [] }])
      onRefresh?.()
      return step as BoardStep
    },
    [projectId, onRefresh]
  )

  // ---- custom status management ----

  /** Materialize the built-in pipeline as project rows before the first customization. */
  const ensureCustomized = useCallback(async (): Promise<ProjectStatus[]> => {
    if (!usingDefaults) return customStatuses
    for (let i = 0; i < DEFAULT_STATUSES.length; i++) {
      const d = DEFAULT_STATUSES[i]
      await fetch(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: d.key, label: d.label, color: d.color, kind: d.kind, order_index: i }),
      })
    }
    return refetchStatuses()
  }, [usingDefaults, customStatuses, projectId, refetchStatuses])

  const handleMoveColumn = useCallback(
    async (key: string, dir: -1 | 1) => {
      try {
        // Materialise the built-in statuses into real rows first. Until a
        // project has project_statuses rows the columns are synthetic, so there
        // is nothing to reorder — which is why this did nothing before.
        const rows = await ensureCustomized()
        const ordered = [...rows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        const i = ordered.findIndex((r) => r.key === key)
        const j = i + dir
        if (i < 0 || j < 0 || j >= ordered.length) return
        const [moved] = ordered.splice(i, 1)
        ordered.splice(j, 0, moved)

        await Promise.all(
          ordered.map((r, idx) =>
            fetch(`/api/projects/${projectId}/statuses/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_index: idx }),
            })
          )
        )
        await refetchStatuses()
        toast.success(`Moved ${moved.label} ${dir === -1 ? "left" : "right"}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move column")
      }
    },
    [ensureCustomized, projectId, refetchStatuses]
  )

  const handleEditColumn = useCallback(
    async (key: string, patch: { label?: string; color?: string; kind?: StatusKind }) => {
      try {
        const rows = await ensureCustomized()
        const row = rows.find((s) => s.key === key)
        if (!row?.id) throw new Error("Status not found")
        const res = await fetch(`/api/projects/${projectId}/statuses/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await refetchStatuses()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update column")
      }
    },
    [ensureCustomized, projectId, refetchStatuses]
  )

  const handleDeleteColumn = useCallback(
    async (key: string) => {
      const count = parents.filter((s) => s.status === key).length
      if (!window.confirm(`Delete this column?${count ? ` ${count} task(s) will move to the first column.` : ""}`)) return
      try {
        const rows = await ensureCustomized()
        const row = rows.find((s) => s.key === key)
        if (!row?.id) throw new Error("Status not found")
        const fallback = rows.find((s) => s.key !== key && s.kind === "open") ?? rows.find((s) => s.key !== key)
        const res = await fetch(
          `/api/projects/${projectId}/statuses/${row.id}?reassign_to=${encodeURIComponent(fallback?.key ?? "pending")}`,
          { method: "DELETE" }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await refetch()
        toast.success("Column deleted")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete column")
      }
    },
    [parents, ensureCustomized, projectId, refetch]
  )

  const handleAddGroup = useCallback(async () => {
    const label = newGroupLabel.trim()
    if (!label) return
    setAddingGroup(false)
    setNewGroupLabel("")
    try {
      const rows = await ensureCustomized()
      const res = await fetch(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: STATUS_PALETTE[rows.length % STATUS_PALETTE.length], kind: "open" }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refetchStatuses()
      toast.success(`Column "${label}" added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add column")
    }
  }, [newGroupLabel, ensureCustomized, projectId, refetchStatuses])

  // ---- step actions ----

  /* handleQuickAdd was the old column-footer input's submit handler. The board's
     own "Add task" button now creates the card and opens it — see onAddTask. */

  const handleCreateSubtask = useCallback(
    async (parentId: string, title: string) => {
      try {
        const parent = steps.find((s) => s.id === parentId)
        await createStep({
          title,
          parent_task_id: parentId,
          phase: parent?.phase || undefined,
          stage: parent?.stage || undefined,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add subtask")
      }
    },
    [steps, createStep]
  )

  const handleDuplicate = useCallback(
    async (step: BoardStep) => {
      try {
        await createStep({
          title: `${step.title} (copy)`,
          description: step.description || "",
          status: openKeyOf(statuses),
          phase: step.phase || undefined,
          stage: step.stage || undefined,
          priority: step.priority || undefined,
          assigned_agent: step.assigned_agent || undefined,
          estimated_hours: step.estimated_hours ? Number(step.estimated_hours) : undefined,
          tags: step.tags,
          tasks: step.tasks,
          acceptance_criteria: step.acceptance_criteria,
        })
        toast.success("Task duplicated")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate")
      }
    },
    [createStep, statuses]
  )

  const handleDelete = useCallback(
    async (step: BoardStep) => {
      if (!window.confirm(`Delete "${step.title}"?`)) return
      const prev = steps
      setSteps((cur) => cur.filter((s) => s.id !== step.id && s.parent_task_id !== step.id))
      setDetailStepId((cur) => (cur === step.id ? null : cur))
      try {
        const res = await fetch(stepUrl(step.id), { method: "DELETE" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success("Task deleted")
        onRefresh?.()
      } catch (err) {
        console.error("Failed to delete step:", err)
        toast.error("Failed to delete task")
        setSteps(prev)
      }
    },
    [steps, projectId, onRefresh]
  )

  const handleToggleComplete = useCallback(
    (step: BoardStep) => {
      const kind = statusMap[step.status]?.kind ?? "open"
      patchStep(step.id, { status: kind === "done" ? openKeyOf(statuses) : doneKeyOf(statuses) })
    },
    [patchStep, statusMap, statuses]
  )

  // ---- filtering / grouping ----

  const visibleParents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return parents.filter((s) => {
      if (!prefs.showCompleted && (statusMap[s.status]?.kind ?? "open") === "done") return false
      if (q && !s.title.toLowerCase().includes(q) && !(s.description ?? "").toLowerCase().includes(q)) return false
      if (filters.priority !== "all" && (s.priority ?? "none") !== filters.priority) return false
      if (filters.agent !== "all" && (s.assigned_agent ?? "none") !== filters.agent) return false
      if (filters.phase !== "all" && (s.phase || "none") !== filters.phase) return false
      if (filters.tag !== "all" && !(Array.isArray(s.tags) && s.tags.includes(filters.tag))) return false
      if (all && filters.project && filters.project !== "all" && s.project_id !== filters.project) return false
      return true
    })
  }, [parents, searchQuery, filters, prefs.showCompleted, statusMap])

  const columns = useMemo(() => {
    const defs = columnsFor(prefs.groupBy, parents, statuses, usingDefaults)
    return defs.filter((c) => {
      if (prefs.groupBy === "status" && !prefs.showCompleted && statusMap[c.key]?.kind === "done") return false
      if (!c.hideWhenEmpty) return true
      return visibleParents.some((s) => groupKeyOf(s, prefs.groupBy) === c.key)
    })
  }, [prefs.groupBy, prefs.showCompleted, parents, statuses, usingDefaults, statusMap, visibleParents])

  const columnSteps = useCallback(
    (key: string) =>
      sortSteps(
        visibleParents.filter((s) => groupKeyOf(s, prefs.groupBy) === key),
        prefs.sortBy
      ),
    [visibleParents, prefs.groupBy, prefs.sortBy]
  )

  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps])

  // ---- drag & drop ----

  const persistColumnOrder = useCallback(
    async (orderedColumnIds: string[]) => {
      // Order is kept per project; on the all-projects board a card's place in its column is not saved.
      if (all) return
      const globalOrder = [...parents].sort((a, b) => a.order_index - b.order_index).map((s) => s.id)
      const inColumn = new Set(orderedColumnIds)
      const queue = [...orderedColumnIds]
      const nextOrder = globalOrder.map((id) => (inColumn.has(id) ? queue.shift()! : id))

      setSteps((prev) => {
        const rank = new Map(nextOrder.map((id, i) => [id, i + 1]))
        return prev.map((s) => (rank.has(s.id) ? { ...s, order_index: rank.get(s.id)! } : s))
      })
      try {
        const res = await fetch(`/api/projects/${projectId}/steps/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIds: nextOrder }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        console.error("Failed to persist order:", err)
        toast.error("Failed to save order")
        refetch()
      }
    },
    [parents, projectId, refetch]
  )

  /**
   * The board applies a move to its own state first and tells us afterwards,
   * where @hello-pangea/dnd asked first and let us veto. So a move we refuse
   * has already happened on screen, and we have to pull the board back to the
   * truth. Bumping this nonce gives `boardColumns` a new identity, which is
   * the board's cue to resync from props.
   */
  const [boardNonce, setBoardNonce] = useState(0)
  const resyncBoard = useCallback(() => setBoardNonce((n) => n + 1), [])

  const handleTaskMove = useCallback(
    (taskId: string, from: { col: string; index: number }, to: { col: string; index: number }) => {
      if (from.col === to.col && from.index === to.index) return

      if (from.col === to.col) {
        if (prefs.sortBy !== "manual") {
          toast.info("Switch sort to Manual to reorder cards")
          resyncBoard()
          return
        }
        const ids = columnSteps(from.col).map((s) => s.id)
        ids.splice(from.index, 1)
        ids.splice(to.index, 0, taskId)
        persistColumnOrder(ids)
        return
      }

      const patch = patchForMove(prefs.groupBy, to.col)
      if (!patch) {
        // e.g. dropping onto a synthetic column there is no way to persist
        toast.info("That column can't be set from the board")
        resyncBoard()
        return
      }
      patchStep(taskId, patch)
      const col = columns.find((c) => c.key === to.col)
      if (col) toast.success(`Moved to ${col.label}`)
    },
    [prefs.sortBy, prefs.groupBy, columnSteps, columns, persistColumnOrder, patchStep, resyncBoard]
  )

  /**
   * MUST stay memoized. The board mirrors `columns` into its own state and
   * resyncs whenever the array identity changes — handing it a freshly built
   * array every render would reset it mid-drag.
   */
  const boardColumns = useMemo(
    () => toKanbanColumns(columns, columnSteps, { statusMap, subtasksOf, showProject: all }),
    // boardNonce is deliberate: it is how a refused move pulls the board back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, columnSteps, statusMap, subtasksOf, boardNonce]
  )

  // ---- detail modal ----

  const detailStep = useMemo(
    () => steps.find((s) => s.id === detailStepId) ?? null,
    [steps, detailStepId]
  )

  const openDetail = useCallback(
    (step: BoardStep) => {
      setDetailStepId(step.id)
      onTaskSelect?.(step)
    },
    [onTaskSelect]
  )

  const openEdit = useCallback((step: BoardStep) => {
    setFormStep(step)
    setShowStepForm(true)
  }, [])

  /*
    Column collapse went with the old board — the adopted one has no collapsed
    state and no header affordance for it. `prefs.collapsed` is deliberately
    left in BoardPrefs so anyone who had columns collapsed keeps that setting
    rather than having it silently dropped from their stored prefs; wire it
    back up here if collapse returns.
  */

  return (
    <>
      <div className="h-full flex flex-col">
        <KanbanToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          groupBy={prefs.groupBy}
          onGroupByChange={(groupBy) => savePrefs({ groupBy })}
          sortBy={prefs.sortBy}
          onSortByChange={(sortBy) => savePrefs({ sortBy })}
          filters={filters}
          onFiltersChange={setFilters}
          phases={phases}
          tags={allTags}
          showCompleted={prefs.showCompleted}
          onShowCompletedChange={(showCompleted) => savePrefs({ showCompleted })}
          expandSubtasks={prefs.expandSubtasks}
          onExpandSubtasksChange={(expandSubtasks) => savePrefs({ expandSubtasks })}
          onCreate={all ? undefined : () => {
            setFormStep(null)
            setShowStepForm(true)
          }}
          projects={projectsOnBoard}
        />

        {fetching ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm py-12">Loading board…</p>
          </div>
        ) : parents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center py-12">
              <p className="text-lg mb-2">No steps defined yet</p>
              <p className="text-sm">Create your first step to start tracking your project progress!</p>
            </div>
          </div>
        ) : (
          // No overflow here — the board's own track owns both scroll axes.
          // Two nested vertical scrollers over the same content is what put
          // two scrollbars on the Ideas board.
          <div className="flex-1 min-h-0 pb-4">
            <KanbanBoard
              columns={boardColumns}
              label="Project board"
              onTaskMove={handleTaskMove}
              onTaskOpen={(task: KanbanTask) => {
                const step = stepById.get(task.id)
                if (step) openDetail(step)
              }}
              /*
                The old board had an inline input in each column footer; the
                adopted one owns its column body and gives us a button only.
                So create the card in the column that was clicked — which is
                what carries the status/priority/phase preset — and open it
                straight away so the title is the next thing you type.
              */
              onAddTask={all ? undefined : async (columnId) => {
                const preset = patchForMove(prefs.groupBy, columnId) ?? {}
                try {
                  const created = await createStep({ title: UNTITLED_TASK, ...preset })
                  if (created?.id) { draftRef.current = created; setDetailStepId(created.id) }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to add task")
                }
              }}
              renderColumnMenu={(col) =>
                prefs.groupBy === "status" && !all ? (
                  <ColumnMenu
                    column={columns.find((c) => c.key === col.id) ?? { ...col, key: col.id, label: col.name, pillClass: "", dotClass: "" }}
                    kind={statusMap[col.id]?.kind ?? "open"}
                    isFirstColumn={columns[0]?.key === col.id}
                    isLastColumn={columns[columns.length - 1]?.key === col.id}
                    onEditColumn={handleEditColumn}
                    onMoveColumn={handleMoveColumn}
                    onDeleteColumn={statuses.length > 1 ? handleDeleteColumn : undefined}
                  />
                ) : null
              }
              renderCardActions={(task) => {
                const step = stepById.get(task.id)
                if (!step) return null
                const kind = statusMap[step.status]?.kind ?? "open"
                return (
                  <CardActions
                    step={step}
                    isDone={kind === "done"}
                    isActive={kind === "active"}
                    activeKey={statuses.find((s) => s.kind === "active")?.key ?? null}
                    onToggleComplete={handleToggleComplete}
                    onPatch={patchStep}
                    onStart={startStep}
                  />
                )
              }}
              renderCardMenu={(task) => {
                const step = stepById.get(task.id)
                if (!step) return null
                return (
                  <CardMenu
                    step={step}
                    isDone={statusMap[step.status]?.kind === "done"}
                    onOpen={openDetail}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onToggleComplete={handleToggleComplete}
                  />
                )
              }}
            />

            {/* Add group (custom status column). Outside the board because the
                board owns its own horizontal track. */}
            {prefs.groupBy === "status" && !all && (
              <div className="mt-2 w-[220px]">
                {addingGroup ? (
                  <Input
                    autoFocus
                    aria-label="New column name"
                    data-phone-tall
                    value={newGroupLabel}
                    placeholder="Column name, Enter to add"
                    className="h-9 text-sm"
                    onChange={(e) => setNewGroupLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddGroup()
                      if (e.key === "Escape") {
                        setAddingGroup(false)
                        setNewGroupLabel("")
                      }
                    }}
                    onBlur={() => {
                      if (!newGroupLabel.trim()) setAddingGroup(false)
                    }}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-9 max-[700px]:h-11 text-muted-foreground text-sm border border-dashed border-border/70"
                    onClick={() => setAddingGroup(true)}
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add group
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <TaskDetailModal
          onStart={startStep}
          step={detailStep}
          subtasks={detailStep ? subtasksOf(detailStep.id) : []}
          allSteps={steps}
          phases={phases}
          statuses={statuses}
          open={!!detailStep}
          onClose={() => {
            // A card made by "Add task" and closed without anything typed, set or added is not kept.
            const draft = draftRef.current
            draftRef.current = null
            if (draft && detailStep && leftUntouched(draft, detailStep, subtasksOf(detailStep.id).length)) {
              setSteps((cur) => cur.filter((s) => s.id !== draft.id))
              fetch(stepUrl(draft.id), { method: "DELETE" })
                .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); toast("Nothing was typed, so the new task was not kept"); onRefresh?.() })
                .catch(() => { toast.error("The empty task could not be removed"); refetch() })
            }
            setDetailStepId(null)
            onTaskSelect?.(null)
          }}
          onPatch={patchStep}
          onCreateSubtask={handleCreateSubtask}
          onDelete={handleDelete}
          onEditFull={(step) => {
            setDetailStepId(null)
            openEdit(step)
          }}
          onOpenStep={(s) => setDetailStepId(s.id)}
          siblings={detailStep && !detailStep.parent_task_id ? columnSteps(groupKeyOf(detailStep, prefs.groupBy)) : []}
        />
      </div>

      <StepFormModal
        open={showStepForm}
        onClose={() => {
          setShowStepForm(false)
          setFormStep(null)
        }}
        projectId={projectId}
        step={formStep}
        availableSteps={parents}
        onSuccess={() => {
          refetch()
          onRefresh?.()
          setFormStep(null)
        }}
      />
    </>
  )
}
