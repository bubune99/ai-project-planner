"use client"

import { useState, useRef, useEffect } from "react"
import { Calendar, Download, Printer, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { GanttTaskRow } from "./GanttTaskRow"
import { GanttTimeline } from "./GanttTimeline"
import type { GanttTask } from "@/lib/types"

interface GanttViewProps {
  tasks?: GanttTask[]
  onTaskSelect?: (task: GanttTask | null) => void
}

type ViewMode = "day" | "week" | "month"

export function GanttView({ tasks, onTaskSelect }: GanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [showDependencies, setShowDependencies] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState({
    start: new Date("2025-01-01"),
    end: new Date("2025-03-31"),
  })

  const taskListRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineHeaderRef = useRef<HTMLDivElement>(null)

  // Use provided tasks or show empty state
  const ganttTasks = Array.isArray(tasks) && tasks.length > 0 ? tasks : []

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
      if (!acc[task.phase]) {
        acc[task.phase] = []
      }
      acc[task.phase].push(task)
      return acc
    },
    {} as Record<number, GanttTask[]>,
  )

  const handleTaskClick = (task: GanttTask) => {
    setSelectedTaskId(task.id)
    onTaskSelect?.(task)
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

  return (
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
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            All Agents
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export PNG
          </Button>
          <Button variant="outline" size="sm">
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
        {ganttTasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center py-12">
              <p className="text-lg mb-2">No steps defined yet</p>
              <p className="text-sm">Create your first step to start tracking your project progress!</p>
            </div>
          </div>
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
                  name: `Phase ${phase}`,
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
                selectedTaskId={selectedTaskId}
                showDependencies={showDependencies}
                tasksByPhase={tasksByPhase}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
