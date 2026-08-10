"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BoardStep } from "@/lib/types"
import { KanbanColumn } from "./KanbanColumn"
import { KanbanToolbar, EMPTY_FILTERS, type BoardFilters } from "./KanbanToolbar"
import { TaskDetailModal } from "./TaskDetailModal"
import { StepFormModal } from "@/components/steps/StepFormModal"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { toast } from "sonner"
import {
  columnsFor,
  groupKeyOf,
  patchForMove,
  sortSteps,
  type GroupBy,
  type SortBy,
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
  collapsed: string[]
}

const DEFAULT_PREFS: BoardPrefs = { groupBy: "status", sortBy: "manual", showCompleted: true, collapsed: [] }

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
  const [fetching, setFetching] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS)
  const [prefs, setPrefs] = useState<BoardPrefs>(() => loadPrefs(projectId))
  const [detailStepId, setDetailStepId] = useState<string | null>(null)
  const [formStep, setFormStep] = useState<BoardStep | null>(null)
  const [showStepForm, setShowStepForm] = useState(false)

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

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps`)
      const data = await res.json()
      if (Array.isArray(data.steps)) setSteps(data.steps)
    } catch (err) {
      console.error("Failed to fetch steps:", err)
      toast.error("Failed to load board")
    } finally {
      setFetching(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const parents = useMemo(() => steps.filter((s) => !s.parent_task_id), [steps])
  const subtasksOf = useCallback((stepId: string) => steps.filter((s) => s.parent_task_id === stepId), [steps])
  const phases = useMemo(
    () => Array.from(new Set(steps.map((s) => s.phase).filter((p): p is string => !!p))),
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
        // Sync server-computed fields (completed_at, progress triggers, …)
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
          status: "pending",
          phase: step.phase || undefined,
          stage: step.stage || undefined,
          priority: step.priority || undefined,
          assigned_agent: step.assigned_agent || undefined,
          estimated_hours: step.estimated_hours ? Number(step.estimated_hours) : undefined,
          tasks: step.tasks,
          acceptance_criteria: step.acceptance_criteria,
        })
        toast.success("Task duplicated")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate")
      }
    },
    [createStep]
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
      patchStep(step.id, { status: step.status === "completed" ? "pending" : "completed" })
    },
    [patchStep]
  )

  // ---- filtering / grouping ----

  const visibleParents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return parents.filter((s) => {
      if (!prefs.showCompleted && s.status === "completed") return false
      if (q && !s.title.toLowerCase().includes(q) && !(s.description ?? "").toLowerCase().includes(q)) return false
      if (filters.priority !== "all" && (s.priority ?? "none") !== filters.priority) return false
      if (filters.agent !== "all" && (s.assigned_agent ?? "none") !== filters.agent) return false
      if (filters.phase !== "all" && (s.phase || "none") !== filters.phase) return false
      return true
    })
  }, [parents, searchQuery, filters, prefs.showCompleted])

  const columns = useMemo(() => {
    const defs = columnsFor(prefs.groupBy, parents)
    return defs.filter((c) => {
      if (prefs.groupBy === "status" && c.key === "completed" && !prefs.showCompleted) return false
      if (!c.hideWhenEmpty) return true
      return visibleParents.some((s) => groupKeyOf(s, prefs.groupBy) === c.key)
    })
  }, [prefs.groupBy, prefs.showCompleted, parents, visibleParents])

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
      // Rebuild the global order: keep non-column steps where they are,
      // slot the column's members in their new relative order.
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
        // Reorder within a column — only meaningful under manual sort
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

      // Cross-column: update the grouped field
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
          showCompleted={prefs.showCompleted}
          onShowCompletedChange={(showCompleted) => savePrefs({ showCompleted })}
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
                  collapsed={prefs.collapsed.includes(column.key)}
                  onToggleCollapse={toggleCollapse}
                  onQuickAdd={handleQuickAdd}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onToggleComplete={handleToggleComplete}
                />
              ))}
            </div>
          </DragDropContext>
        )}

        <TaskDetailModal
          step={detailStep}
          subtasks={detailStep ? subtasksOf(detailStep.id) : []}
          allSteps={steps}
          phases={phases}
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
