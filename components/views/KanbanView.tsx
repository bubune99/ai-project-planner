"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BoardStep } from "@/lib/types"
import { KanbanColumn } from "./KanbanColumn"
import { KanbanToolbar, EMPTY_FILTERS, type BoardFilters } from "./KanbanToolbar"
import { TaskDetailModal } from "./TaskDetailModal"
import { StepFormModal } from "@/components/steps/StepFormModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
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
} from "./kanban-config"

interface KanbanViewProps {
  projectId: string
  onTaskSelect?: (step: BoardStep | null) => void
  onRefresh?: () => void
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

export function KanbanView({ projectId, onTaskSelect, onRefresh }: KanbanViewProps) {
  const [steps, setSteps] = useState<BoardStep[]>([])
  const [customStatuses, setCustomStatuses] = useState<ProjectStatus[]>([])
  const [fetching, setFetching] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS)
  const [prefs, setPrefs] = useState<BoardPrefs>(() => loadPrefs(projectId))
  const [detailStepId, setDetailStepId] = useState<string | null>(null)
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
        fetch(`/api/projects/${projectId}/steps`),
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
  const subtasksOf = useCallback((stepId: string) => steps.filter((s) => s.parent_task_id === stepId), [steps])
  const phases = useMemo(
    () => Array.from(new Set(steps.map((s) => s.phase).filter((p): p is string => !!p))),
    [steps]
  )
  const allTags = useMemo(
    () => Array.from(new Set(steps.flatMap((s) => (Array.isArray(s.tags) ? s.tags : [])))).sort(),
    [steps]
  )

  /** Optimistically apply a patch locally, then persist; revert via refetch on failure. */
  const patchStep = useCallback(
    async (stepId: string, patch: Record<string, unknown>) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? ({ ...s, ...patch } as BoardStep) : s))
      )
      try {
        const res = await fetch(`/api/projects/${projectId}/steps/${stepId}`, {
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

  const handleQuickAdd = useCallback(
    async (columnKey: string, title: string) => {
      const preset = patchForMove(prefs.groupBy, columnKey) ?? {}
      try {
        await createStep({ title, ...preset })
        toast.success("Task added")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add task")
      }
    },
    [prefs.groupBy, createStep]
  )

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
        const res = await fetch(`/api/projects/${projectId}/steps/${step.id}`, { method: "DELETE" })
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

  // ---- drag & drop ----

  const persistColumnOrder = useCallback(
    async (orderedColumnIds: string[]) => {
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

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination) return
      if (source.droppableId === destination.droppableId && source.index === destination.index) return

      if (source.droppableId === destination.droppableId) {
        if (prefs.sortBy !== "manual") {
          toast.info("Switch sort to Manual to reorder cards")
          return
        }
        const ids = columnSteps(source.droppableId).map((s) => s.id)
        ids.splice(source.index, 1)
        ids.splice(destination.index, 0, draggableId)
        persistColumnOrder(ids)
        return
      }

      const patch = patchForMove(prefs.groupBy, destination.droppableId)
      if (!patch) return
      patchStep(draggableId, patch)
      const col = columns.find((c) => c.key === destination.droppableId)
      if (col) toast.success(`Moved to ${col.label}`)
    },
    [prefs.sortBy, prefs.groupBy, columnSteps, columns, persistColumnOrder, patchStep]
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

  const toggleCollapse = useCallback(
    (key: string) => {
      savePrefs({
        collapsed: prefs.collapsed.includes(key)
          ? prefs.collapsed.filter((k) => k !== key)
          : [...prefs.collapsed, key],
      })
    },
    [prefs.collapsed, savePrefs]
  )

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
          onCreate={() => {
            setFormStep(null)
            setShowStepForm(true)
          }}
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
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 flex gap-3 overflow-x-auto items-start pb-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={`${prefs.groupBy}:${column.key}`}
                  column={column}
                  steps={columnSteps(column.key)}
                  subtasksOf={subtasksOf}
                  statusMap={statusMap}
                  expandSubtasks={prefs.expandSubtasks}
                  collapsed={prefs.collapsed.includes(column.key)}
                  onEditColumn={prefs.groupBy === "status" ? handleEditColumn : undefined}
                  onDeleteColumn={
                    prefs.groupBy === "status" && statuses.length > 1 ? handleDeleteColumn : undefined
                  }
                  onToggleCollapse={toggleCollapse}
                  onQuickAdd={handleQuickAdd}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onToggleComplete={handleToggleComplete}
                />
              ))}

              {/* Add group (custom status column) */}
              {prefs.groupBy === "status" && (
                <div className="shrink-0 w-[220px]">
                  {addingGroup ? (
                    <Input
                      autoFocus
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
                      className="w-full justify-start h-9 text-muted-foreground text-sm border border-dashed border-border/70"
                      onClick={() => setAddingGroup(true)}
                    >
                      <Plus className="w-4 h-4 mr-1.5" /> Add group
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DragDropContext>
        )}

        <TaskDetailModal
          step={detailStep}
          subtasks={detailStep ? subtasksOf(detailStep.id) : []}
          allSteps={steps}
          phases={phases}
          statuses={statuses}
          open={!!detailStep}
          onClose={() => {
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
