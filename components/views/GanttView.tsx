"use client"

import { useState, useRef, useEffect } from "react"

/**
 * Convert a SCHEDULED step to a Gantt bar.
 *
 * The scheduling rules live in lib/scheduling.ts, as pure functions, so they
 * can be executed against real inputs without a dev server or a build.
 * This used to invent dates for undated steps — start was
 * `new Date(year, month, 1 + index * 3)`, end was start + 7 days — so a project
 * with no schedule still rendered a confident-looking chart in which 414 of 477
 * bars corresponded to nothing.
 */
function stepToGantt(step: any): any {
  // Non-null: callers filter with isScheduled() before mapping.
  const { start, end } = barDates(step)!
  const statusMap: Record<string, string> = {
    pending: "pending", "in-progress": "in_progress", in_progress: "in_progress",
    review: "in_progress", completed: "completed", blocked: "pending",
  }
  return {
    id: step.id,
    name: step.title || "Untitled",
    agent: { name: step.assigned_agent || "human" },
    startDate: start,
    endDate: end,
    progress: step.progress || (step.status === "completed" ? 100 : 0),
    dependencies: (step.dependencies || []).map((d: any) => d.depends_on_step_id || d).filter(Boolean),
    phase: typeof step.phase === "string" ? parseInt(step.phase) || 1 : (step.phase || 1),
    // Phases here are words ('ideation', 'imported'), so the parseInt above
    // always yields NaN -> 1 and every step landed in one "Phase 1" group. Keep
    // the numeric field for the existing type; group and display on this.
    phaseLabel: phaseLabel(step.phase),
    status: statusMap[step.status] ?? "pending",
  }
}
import { Calendar, Download, Printer, Filter, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { GanttTaskRow } from "./GanttTaskRow"
import { GanttTimeline } from "./GanttTimeline"
import { StepFormModal } from "@/components/steps/StepFormModal"
import type { GanttTask, UnscheduledStep } from "@/lib/types"
import { isScheduled, barDates, phaseLabel, scheduleFromDueDate } from "@/lib/scheduling"

interface GanttViewProps {
  tasks?: GanttTask[]
  projectId: string
  onTaskSelect?: (task: GanttTask | null) => void
  onRefresh?: () => void
  onFilterAgents?: () => void
  onExportPng?: () => void
  onPrint?: () => void
}

type ViewMode = "day" | "week" | "month"

export function GanttView({ tasks: initialTasks, projectId, onTaskSelect, onRefresh, onFilterAgents, onExportPng, onPrint }: GanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [showDependencies, setShowDependencies] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showStepForm, setShowStepForm] = useState(false)
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null)
  const [fetchedTasks, setFetchedTasks] = useState<GanttTask[]>([])
  const [fetching, setFetching] = useState(false)
  const [unscheduled, setUnscheduled] = useState<UnscheduledStep[]>([])
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [showUnscheduled, setShowUnscheduled] = useState(true)
  const [draftDates, setDraftDates] = useState<Record<string, string>>({})

  // Dynamic date range: start of current month, 3 months forward
  const today = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: new Date(today.getFullYear(), today.getMonth() + 3, 0),
  })

  const taskListRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineHeaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (Array.isArray(initialTasks) && initialTasks.length > 0) return
    setFetching(true)
    loadSteps()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadSteps() {
    setFetching(true)
    return fetch(`/api/projects/${projectId}/steps`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.steps)) return
        // Split, don't fabricate. Only steps carrying a real date get a bar;
        // the rest go to the Unscheduled rail so they stay visible instead of
        // being quietly invented onto the chart.
        const mapped = data.steps.filter(isScheduled).map(stepToGantt)
        setFetchedTasks(mapped)
        setUnscheduled(
          data.steps
            .filter((s: any) => !isScheduled(s))
            .map((s: any) => ({
              id: s.id,
              title: s.title,
              status: s.status,
              priority: s.priority ?? null,
              phase: s.phase ?? null,
            })),
        )
        const dates = mapped.flatMap((t: any) => [t.startDate, t.endDate]).filter(Boolean)
        if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())))
          const maxDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())))
          setDateRange({ start: minDate, end: maxDate })
        }
      })
      .catch(console.error)
      .finally(() => setFetching(false))
  }

  /** Give an unscheduled step a date. The PATCH route already accepts
   *  start_date/end_date; nothing in the UI ever sent them, which is why 414
   *  steps had no schedule. start defaults to today so a single due date is
   *  enough to place something on the chart. */
  async function scheduleStep(stepId: string, due: string) {
    if (!due) return
    setScheduling(stepId)
    try {
      const dates = scheduleFromDueDate(due)
      if (!dates) return
      const res = await fetch(`/api/projects/${projectId}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dates),
      })
      if (!res.ok) throw new Error(`Schedule failed (${res.status})`)
      await loadSteps()
      onRefresh?.()
    } catch (e) {
      console.error(e)
    } finally {
      setScheduling(null)
    }
  }

  // Use provided tasks or self-fetched
  const ganttTasks = Array.isArray(initialTasks) && initialTasks.length > 0 ? initialTasks : fetchedTasks

  useEffect(() => {
    const taskList = taskListRef.current
    const timeline = timelineRef.current
    const timelineHeader = timelineHeaderRef.current

    if (!taskList || !timeline || !timelineHeader) return

    const handleTaskListScroll = () => {
      if (timeline.scrollTop !== taskList.scrollTop) {
        timeline.scrollTop = taskList.scrollTop
      }
    }

    const handleTimelineScroll = () => {
      if (taskList.scrollTop !== timeline.scrollTop) {
        taskList.scrollTop = timeline.scrollTop
      }
      timelineHeader.style.transform = `translateX(-${timeline.scrollLeft}px)`
    }

    taskList.addEventListener("scroll", handleTaskListScroll)
    timeline.addEventListener("scroll", handleTimelineScroll)

    return () => {
      taskList.removeEventListener("scroll", handleTaskListScroll)
      timeline.removeEventListener("scroll", handleTimelineScroll)
    }
  }, [])

  // Group tasks by phase
  const tasksByPhase = ganttTasks.reduce(
    (acc, task) => {
      const key = (task as any).phaseLabel || String(task.phase)
      if (!acc[key]) acc[key] = []
      acc[key].push(task)
      return acc
    },
    {} as Record<string, GanttTask[]>,
  )

  const handleTaskClick = (task: GanttTask) => {
    setSelectedTaskId(task.id)
    setSelectedTask(task)
    onTaskSelect?.(task)
  }

  const handleEditTask = (task: GanttTask) => {
    setSelectedTask(task)
    setShowStepForm(true)
  }

  // Generate date headers based on view mode
  const generateDateHeaders = () => {
    const headers: string[] = []
    const current = new Date(dateRange.start)
    const end = new Date(dateRange.end)

    if (viewMode === "week") {
      while (current <= end) {
        const weekStart = new Date(current)
        const weekEnd = new Date(current)
        weekEnd.setDate(weekEnd.getDate() + 6)
        headers.push(
          `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        )
        current.setDate(current.getDate() + 7)
      }
    } else if (viewMode === "month") {
      while (current <= end) {
        headers.push(current.toLocaleDateString("en-US", { month: "long", year: "numeric" }))
        current.setMonth(current.getMonth() + 1)
      }
    } else {
      // day view
      while (current <= end) {
        headers.push(current.toLocaleDateString("en-US", { month: "short", day: "numeric" }))
        current.setDate(current.getDate() + 1)
      }
    }

    return headers
  }

  const dateHeaders = generateDateHeaders()

  /**
   * Unscheduled rail: steps with no start_date and no end_date.
   *
   * They are deliberately NOT drawn on the timeline. Before this, GanttView
   * fabricated a start (1st of the current month + index*3 days) and a 7-day
   * length for every undated step, so the chart looked authoritative while
   * 414 of 477 bars meant nothing. Now they wait here until given a date.
   *
   * Setting a date PATCHes the step, which puts it on the chart and on the
   * calendar, since both read project_steps.start_date/end_date.
   */
  const UnscheduledRail =
    unscheduled.length > 0 && showUnscheduled ? (
      <div className="w-[300px] flex-shrink-0 border-l border-border overflow-y-auto bg-card">
        <div className="sticky top-0 flex items-center justify-between px-3 py-2 border-b border-border bg-accent/30">
          <span className="text-sm font-semibold text-foreground">
            Unscheduled ({unscheduled.length})
          </span>
          <button
            onClick={() => setShowUnscheduled(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Hide
          </button>
        </div>
        <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          Not on the timeline yet. Pick a due date to place one.
        </p>
        <ul className="divide-y divide-border">
          {unscheduled.map(step => (
            <li key={step.id} className="px-3 py-2.5">
              <div className="text-sm text-foreground leading-snug mb-1.5">{step.title}</div>
              <div className="flex items-center gap-1.5 mb-2">
                {step.priority && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                    {step.priority}
                  </span>
                )}
                {step.phase && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                    {step.phase}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label={`Due date for ${step.title}`}
                  value={draftDates[step.id] ?? ""}
                  onChange={e => setDraftDates(prev => ({ ...prev, [step.id]: e.target.value }))}
                  className="flex-1 min-w-0 h-7 px-1.5 text-xs rounded border border-border bg-background text-foreground"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={!draftDates[step.id] || scheduling === step.id}
                  onClick={() => scheduleStep(step.id, draftDates[step.id])}
                >
                  {scheduling === step.id ? "…" : "Place"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <>
      <div className="h-full flex flex-col bg-card border border-border rounded-lg">
        {/* Header Controls */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-accent/30 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {dateRange.start.toLocaleDateString("en-US", { month: "short", year: "numeric" })} -{" "}
                {dateRange.end.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-background border border-border rounded-md p-1">
              <Button
                variant={viewMode === "day" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("day")}
                className="h-7 px-3"
              >
                Day
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("week")}
                className="h-7 px-3"
              >
                Week
              </Button>
              <Button
                variant={viewMode === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("month")}
                className="h-7 px-3"
              >
                Month
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="dependencies"
                checked={showDependencies}
                onCheckedChange={(checked) => setShowDependencies(checked as boolean)}
              />
              <label htmlFor="dependencies" className="text-sm text-muted-foreground cursor-pointer">
                Show Dependencies
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unscheduled.length > 0 && !showUnscheduled && (
              <Button variant="outline" size="sm" onClick={() => setShowUnscheduled(true)}>
                Unscheduled ({unscheduled.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowStepForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Step
            </Button>
            <Button variant="outline" size="sm" onClick={onFilterAgents}>
              <Filter className="w-4 h-4 mr-2" />
              All Agents
            </Button>
            <Button variant="outline" size="sm" onClick={onExportPng}>
              <Download className="w-4 h-4 mr-2" />
              Export PNG
            </Button>
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Timeline Header */}
        <div className="flex border-b border-border bg-accent/20 flex-shrink-0">
          <div className="w-[300px] flex-shrink-0 px-4 py-2 border-r border-border">
            <span className="text-sm font-semibold text-foreground">Tasks</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <div ref={timelineHeaderRef} className="flex h-full min-w-[800px] transition-transform">
              {dateHeaders.map((header, i) => (
                <div key={i} className="flex-1 px-2 py-2 text-center border-r border-border last:border-r-0">
                  <span className="text-xs font-medium text-muted-foreground">{header}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gantt Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {fetching ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center py-12"><p className="text-sm">Loading tasks…</p></div>
            </div>
          ) : ganttTasks.length === 0 && unscheduled.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center py-12">
                <p className="text-lg mb-2">No steps defined yet</p>
                <p className="text-sm">Create your first step to start tracking your project progress!</p>
              </div>
            </div>
          ) : ganttTasks.length === 0 ? (
            // Steps exist but none are scheduled. Say that plainly instead of
            // claiming there is nothing here -- the rail on the right has them.
            <>
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center py-12 px-6">
                  <p className="text-lg mb-2">Nothing scheduled yet</p>
                  <p className="text-sm">
                    {unscheduled.length} step{unscheduled.length === 1 ? "" : "s"} are waiting for a date.
                    Give one a due date on the right and it appears here.
                  </p>
                </div>
              </div>
              {UnscheduledRail}
            </>
          ) : (
            <>
              {/* Task List */}
              <div
                ref={taskListRef}
                className="w-[300px] flex-shrink-0 border-r border-border overflow-y-auto overflow-x-hidden bg-card"
              >
                {Object.entries(tasksByPhase).map(([phase, tasks]) => {
                  const phaseTask: GanttTask = {
                    id: `phase-${phase}`,
                    name: phase,
                    agent: tasks[0].agent,
                    startDate: tasks[0].startDate,
                    endDate: tasks[tasks.length - 1].endDate,
                    progress: Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length),
                    dependencies: [],
                    phase: Number(phase),
                    status: tasks.every((t) => t.status === "completed")
                      ? "completed"
                      : tasks.some((t) => t.status === "in_progress")
                        ? "in_progress"
                        : "pending",
                  }

                  return (
                    <GanttTaskRow
                      key={phase}
                      task={phaseTask}
                      isPhaseHeader
                      onTaskClick={handleTaskClick}
                      isSelected={selectedTaskId === phaseTask.id}
                    >
                      {tasks.map((task) => (
                        <GanttTaskRow
                          key={task.id}
                          task={task}
                          level={1}
                          onTaskClick={handleTaskClick}
                          isSelected={selectedTaskId === task.id}
                        />
                      ))}
                    </GanttTaskRow>
                  )
                })}
              </div>

              {/* Timeline */}
              <div ref={timelineRef} className="flex-1 overflow-auto bg-background/50">
                <GanttTimeline
                  tasks={ganttTasks}
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onTaskClick={handleTaskClick}
                  selectedTaskId={selectedTaskId ?? undefined}
                  showDependencies={showDependencies}
                  tasksByPhase={tasksByPhase as unknown as Record<number, GanttTask[]>}
                />
              </div>

              {UnscheduledRail}
            </>
          )}
        </div>
      </div>

      {/* Step Form Modal */}
      <StepFormModal
        open={showStepForm}
        onClose={() => {
          setShowStepForm(false)
          setSelectedTask(null)
        }}
        projectId={projectId}
        step={selectedTask}
        availableSteps={ganttTasks}
        onSuccess={() => {
          onRefresh?.()
          setSelectedTask(null)
        }}
      />
    </>
  )
}
